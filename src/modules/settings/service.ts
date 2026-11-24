import "server-only";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/modules/shared/api";
import { writeAuditLog } from "@/modules/audit/audit";
import {
  changePasswordSchema,
  createStaffSchema,
  resetPasswordSchema,
  updatePermissionsSchema,
  updateUserSchema,
  type ChangePasswordInput,
  type CreateStaffInput,
  type ResetPasswordInput,
  type UpdateHospitalSettingsInput,
  type UpdatePermissionsInput,
  type UpdateUserInput,
} from "./schemas";
import {
  PERMISSION_KEYS,
  defaultPermissionsFor,
  isPermissionKey,
  resolvePermissions,
  type PermissionKey,
} from "@/modules/auth/permissions";

/** bcrypt work factor — matches the hashes created by `prisma/seed.ts`. */
const PASSWORD_ROUNDS = 10;

export async function updateHospitalSettings(
  input: UpdateHospitalSettingsInput,
  actor: User,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.hospitalSettings.findFirst();

    const after = await tx.hospitalSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        hospitalName: input.hospitalName,
        address: input.address,
        upiId: input.upiId,
        upiQrImageUrl: input.upiQrImageUrl ?? "/uploads/upi-qr.png",
        receiptFooter: input.receiptFooter,
        termsText: input.termsText,
        logoImageUrl: input.logoImageUrl ?? "",
        tagline: input.tagline ?? "",
        phone: input.phone ?? "",
        email: input.email ?? "",
        website: input.website ?? "",
        gstin: input.gstin ?? "",
        signatureImageUrl: input.signatureImageUrl ?? "",
      },
      update: {
        hospitalName: input.hospitalName,
        address: input.address,
        upiId: input.upiId,
        receiptFooter: input.receiptFooter,
        termsText: input.termsText,
        tagline: input.tagline ?? "",
        phone: input.phone ?? "",
        email: input.email ?? "",
        website: input.website ?? "",
        gstin: input.gstin ?? "",
        ...(input.upiQrImageUrl ? { upiQrImageUrl: input.upiQrImageUrl } : {}),
        ...(input.logoImageUrl !== undefined
          ? { logoImageUrl: input.logoImageUrl }
          : {}),
        ...(input.signatureImageUrl !== undefined
          ? { signatureImageUrl: input.signatureImageUrl }
          : {}),
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "SETTINGS_UPDATED",
      entity: "HospitalSettings",
      entityId: "1",
      before,
      after,
    });

    return after;
  });
}

function auditUser(user: User) {
  return {
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
  };
}

/**
 * Characters that are easy to read out over the phone and type on a keyboard.
 * Ambiguous glyphs (0/O, 1/l/I) are deliberately excluded.
 */
function readablePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  const pick = (set: string) => set[randomInt(0, set.length)];

  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < 10) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/**
 * POST /api/users — Admin creates a staff account.
 * A temporary password is generated unless one is supplied. The password is
 * hashed before it is stored and returned to the caller exactly once.
 */
export async function createStaff(input: CreateStaffInput, actor: User) {
  const data = createStaffSchema.parse(input);
  const email = data.email.toLowerCase();
  const generated = !data.temporaryPassword;
  const temporaryPassword = data.temporaryPassword ?? readablePassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, PASSWORD_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiError(409, "A staff account with this email already exists");
    }

    const created = await tx.user.create({
      data: {
        name: data.name,
        email,
        role: data.role,
        passwordHash,
        active: true,
        mustChangePassword: true,
        tempPasswordIssuedAt: new Date(),
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "USER_CREATED",
      entity: "User",
      entityId: created.id,
      before: null,
      after: {
        ...auditUser(created),
        mustChangePassword: true,
        temporaryPasswordGenerated: generated,
      },
    });

    return created;
  });

  return { user, temporaryPassword, generated };
}

/**
 * POST /api/users/:id/password-reset — issue a new temporary password.
 * The new password is never placed in the audit log.
 */
export async function resetStaffPassword(
  userId: string,
  input: ResetPasswordInput,
  actor: User,
) {
  const data = resetPasswordSchema.parse(input);
  if (userId === actor.id) {
    throw new ApiError(
      400,
      "Use Change password to set your own password",
    );
  }

  const generated = !data.newPassword;
  const temporaryPassword = data.newPassword ?? readablePassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, PASSWORD_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: userId } });
    if (!before) throw new ApiError(404, "User not found");

    const after = await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: true,
        tempPasswordIssuedAt: new Date(),
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "USER_PASSWORD_RESET",
      entity: "User",
      entityId: userId,
      before: { mustChangePassword: before.mustChangePassword },
      after: { mustChangePassword: true, temporaryPasswordGenerated: generated },
    });

    return after;
  });

  return { user, temporaryPassword, generated };
}

/**
 * POST /api/account/change-password — the signed-in user sets their own
 * password. Verifies the current password, clears the forced-change flag and
 * audit logs the event (never the password itself).
 */
export async function changeOwnPassword(
  actor: User,
  input: ChangePasswordInput,
) {
  const data = changePasswordSchema.parse(input);

  const current = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!current || !current.active) {
    throw new ApiError(401, "Your session is no longer valid");
  }

  const valid = await bcrypt.compare(data.currentPassword, current.passwordHash);
  if (!valid) {
    throw new ApiError(400, "Current password is incorrect", {
      field: "currentPassword",
    });
  }

  const passwordHash = await bcrypt.hash(data.newPassword, PASSWORD_ROUNDS);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: current.id },
      data: { passwordHash, mustChangePassword: false, tempPasswordIssuedAt: null },
    });

    await writeAuditLog(tx, {
      userId: current.id,
      action: "USER_PASSWORD_CHANGED",
      entity: "User",
      entityId: current.id,
      before: { mustChangePassword: current.mustChangePassword },
      after: { mustChangePassword: false },
    });
  });
}

/**
 * PATCH /api/users/:id — edit profile, role or activation.
 * Self-service restrictions: an admin cannot change their own role or
 * deactivate themselves (prevents locking the hospital out of its own panel).
 */
export async function updateUser(
  userId: string,
  rawInput: UpdateUserInput,
  actor: User,
) {
  const input = updateUserSchema.parse(rawInput);

  if (userId === actor.id && input.active === false) {
    throw new ApiError(400, "You cannot deactivate your own account");
  }
  if (userId === actor.id && input.role !== undefined && input.role !== actor.role) {
    throw new ApiError(400, "You cannot change your own role");
  }

  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: userId } });
    if (!before) throw new ApiError(404, "User not found");

    if (input.email && input.email !== before.email) {
      const duplicate = await tx.user.findUnique({ where: { email: input.email } });
      if (duplicate) {
        throw new ApiError(409, "A staff account with this email already exists");
      }
    }

    const after = await tx.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
      },
    });

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "USER_UPDATED",
      entity: "User",
      entityId: userId,
      before: auditUser(before),
      after: auditUser(after),
    });

    return after;
  });
}

/**
 * PUT /api/users/:id/permissions — replace a user's permission overrides.
 * Rows are only stored where the choice differs from the role default, so a
 * later role change keeps its natural defaults. Never grants anything to a
 * user editing themselves (prevents accidental lock-out).
 */
export async function setUserPermissions(
  userId: string,
  input: UpdatePermissionsInput,
  actor: User,
) {
  const data = updatePermissionsSchema.parse(input);
  if (userId === actor.id) {
    throw new ApiError(400, "You cannot change your own permissions");
  }

  const desired = new Set(data.permissions.filter(isPermissionKey));

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(404, "User not found");

    const before = await tx.userPermission.findMany({ where: { userId } });
    const beforeEffective = [...resolvePermissions(user.role, before)].sort();
    const roleDefaults = defaultPermissionsFor(user.role);

    const toDelete = PERMISSION_KEYS.filter(
      (key) => desired.has(key) === roleDefaults.has(key),
    );
    if (toDelete.length > 0) {
      await tx.userPermission.deleteMany({
        where: { userId, permission: { in: toDelete } },
      });
    }

    for (const key of PERMISSION_KEYS) {
      const allow = desired.has(key);
      if (allow === roleDefaults.has(key)) continue;
      await tx.userPermission.upsert({
        where: { userId_permission: { userId, permission: key } },
        create: { userId, permission: key, allowed: allow },
        update: { allowed: allow },
      });
    }

    const afterEffective: PermissionKey[] = [...desired].sort();

    await writeAuditLog(tx, {
      userId: actor.id,
      action: "USER_PERMISSIONS_UPDATED",
      entity: "User",
      entityId: userId,
      before: { permissions: beforeEffective },
      after: { permissions: afterEffective },
    });

    return afterEffective;
  });
}

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Stores the ONE static UPI QR image and points HospitalSettings at it. */
export async function saveUpiQrImage(file: File, actor: User) {
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    throw new ApiError(400, "Upload a PNG, JPEG or WebP image");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new ApiError(400, "Image must be smaller than 2 MB");
  }

  const fileName = `upi-qr-${Date.now()}.${extension}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, fileName), buffer);

  const url = `/uploads/${fileName}`;

  await prisma.$transaction(async (tx) => {
    const before = await tx.hospitalSettings.findFirst();
    const settings = await tx.hospitalSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        hospitalName: "AHLAIN HOSPITAL",
        address: "",
        upiId: "ahlainhospital@upi",
        upiQrImageUrl: url,
      },
      update: { upiQrImageUrl: url },
    });
    await writeAuditLog(tx, {
      userId: actor.id,
      action: "UPI_QR_UPDATED",
      entity: "HospitalSettings",
      entityId: "1",
      before: before ? { upiQrImageUrl: before.upiQrImageUrl } : null,
      after: { upiQrImageUrl: settings.upiQrImageUrl },
    });
  });

  return url;
}

type BrandingImage = {
  prefix: string;
  field: "logoImageUrl" | "signatureImageUrl";
  action: string;
};

/** Shared store-and-point logic for branding images (logo, signature). */
async function saveBrandingImage(file: File, actor: User, kind: BrandingImage) {
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    throw new ApiError(400, "Upload a PNG, JPEG or WebP image");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new ApiError(400, "Image must be smaller than 2 MB");
  }

  const fileName = `${kind.prefix}-${Date.now()}.${extension}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, fileName), buffer);

  const url = `/uploads/${fileName}`;

  await prisma.$transaction(async (tx) => {
    const before = await tx.hospitalSettings.findFirst();
    const settings = await tx.hospitalSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        hospitalName: "AHLAIN HOSPITAL",
        address: "",
        upiId: "ahlainhospital@upi",
        [kind.field]: url,
      },
      update: { [kind.field]: url },
    });
    await writeAuditLog(tx, {
      userId: actor.id,
      action: kind.action,
      entity: "HospitalSettings",
      entityId: "1",
      before: before ? { [kind.field]: before[kind.field] } : null,
      after: { [kind.field]: settings[kind.field] },
    });
  });

  return url;
}

/** Stores the hospital logo used on printed documents. */
export function saveBrandLogo(file: File, actor: User) {
  return saveBrandingImage(file, actor, {
    prefix: "logo",
    field: "logoImageUrl",
    action: "BRAND_LOGO_UPDATED",
  });
}

/** Stores the authorised signature image printed on invoices and receipts. */
export function saveSignatureImage(file: File, actor: User) {
  return saveBrandingImage(file, actor, {
    prefix: "signature",
    field: "signatureImageUrl",
    action: "BRAND_SIGNATURE_UPDATED",
  });
}
