import { NextResponse } from "next/server";
import { requireApiUser, requireApiPermission } from "@/modules/auth/guards";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { createStaffSchema } from "@/modules/settings/schemas";
import { createStaff } from "@/modules/settings/service";

export async function GET(req: Request) {
  try {
    await requireApiUser();
    const url = new URL(req.url);
    const roleParam = url.searchParams.get("role");

    const where: { role?: Role; active?: boolean } = { active: true };
    if (roleParam) {
      where.role = roleParam as Role;
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });

    return NextResponse.json({ items: users, total: users.length });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/users — Admin creates a staff account.
 * The temporary password is returned once in the response and stored only as a
 * bcrypt hash. The account must change it on first sign-in.
 */
export async function POST(req: Request) {
  try {
    const actor = await requireApiPermission("users.manage");
    const input = await parseBody(createStaffSchema, req);
    const { user, temporaryPassword, generated } = await createStaff(input, actor);

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active,
          mustChangePassword: user.mustChangePassword,
        },
        temporaryPassword,
        generated,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
