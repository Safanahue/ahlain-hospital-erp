"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Loader2, Pencil, Plus, ShieldAlert, ShieldCheck, UserX } from "lucide-react";
import type { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/modules/auth/roles";
import {
  PERMISSION_CATALOG,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  ROLE_PERMISSION_DEFAULTS,
  type PermissionKey,
} from "@/modules/auth/permissions";
import { StatusBadge } from "@/modules/shared/components/Badges";
import { formatDateTime } from "@/modules/shared/datetime";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  permissions: PermissionKey[];
};

type Dialog =
  | { kind: "create" }
  | { kind: "edit"; user: StaffRow }
  | { kind: "reset"; user: StaffRow }
  | { kind: "permissions"; user: StaffRow };

type TempCredential = {
  name: string;
  email: string;
  password: string;
  generated: boolean;
};

const PASSWORD_RULES =
  "At least 8 characters, with a letter and a number.";

export default function StaffManager({
  users,
  currentUserId,
}: {
  users: StaffRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [credential, setCredential] = useState<TempCredential | null>(null);
  const [rowPending, setRowPending] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  function closeDialog() {
    setDialog(null);
    setCredential(null);
  }

  async function toggleActive(user: StaffRow) {
    if (rowPending) return;
    setRowPending(user.id);
    setRowError(null);
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !user.active }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRowError(data.error ?? "Update failed");
      } else {
        router.refresh();
      }
    } catch {
      setRowError("Network error");
    } finally {
      setRowPending(null);
    }
  }

  return (
    <section className="card">
      <div className="card-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="card-title">Staff accounts</h2>
          <p className="card-subtitle">
            Create accounts, issue temporary passwords, reset access and manage roles.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            setCredential(null);
            setDialog({ kind: "create" });
          }}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add staff
        </button>
      </div>

      {rowError ? (
        <p role="alert" className="mx-5 mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
          {rowError}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead>Password</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              return (
                <TableRow key={user.id}>
                  <TableCell className="font-medium text-navy">
                    {user.name}
                    {isSelf ? (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                        user.role === "ADMIN"
                          ? "bg-purple-50 text-purple-700 border border-purple-200"
                          : user.role === "DOCTOR"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : user.role === "RECEPTION"
                              ? "bg-teal-50 text-teal-700 border border-teal-200"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {ROLE_LABELS[user.role]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={user.active ? "Active" : "Inactive"}
                      tone={user.active ? "success" : "neutral"}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {user.lastLoginAt ? formatDateTime(new Date(user.lastLoginAt)) : "Never"}
                  </TableCell>
                  <TableCell>
                    {user.mustChangePassword ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">
                        <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                        Temporary
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Set by user</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setCredential(null);
                          setDialog({ kind: "edit", user });
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={isSelf}
                        title={isSelf ? "Use Change password for your own account" : undefined}
                        onClick={() => {
                          setCredential(null);
                          setDialog({ kind: "reset", user });
                        }}
                      >
                        <KeyRound className="h-3.5 w-3.5" aria-hidden />
                        Reset password
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={isSelf}
                        title={isSelf ? "You cannot change your own permissions" : undefined}
                        onClick={() => {
                          setCredential(null);
                          setDialog({ kind: "permissions", user });
                        }}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                        Permissions
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={isSelf || rowPending === user.id}
                        title={isSelf ? "You cannot change your own status" : undefined}
                        onClick={() => toggleActive(user)}
                      >
                        {rowPending === user.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <UserX className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {user.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {dialog && dialog.kind === "permissions" ? (
        <PermissionsDialog
          user={dialog.user}
          onClose={closeDialog}
          onSaved={() => router.refresh()}
        />
      ) : null}

      {dialog && dialog.kind !== "permissions" ? (
        <StaffDialog
          dialog={dialog}
          currentUserId={currentUserId}
          credential={credential}
          onCredential={setCredential}
          onClose={closeDialog}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </section>
  );
}

function StaffDialog({
  dialog,
  currentUserId,
  credential,
  onCredential,
  onClose,
  onSaved,
}: {
  dialog: Dialog;
  currentUserId: string;
  credential: TempCredential | null;
  onCredential: (credential: TempCredential | null) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isCreate = dialog.kind === "create";
  const isEdit = dialog.kind === "edit";
  const isReset = dialog.kind === "reset";
  const target = isCreate ? null : dialog.user;
  const isSelf = target?.id === currentUserId;

  const [name, setName] = useState(target?.name ?? "");
  const [email, setEmail] = useState(target?.email ?? "");
  const [role, setRole] = useState<Role>(target?.role ?? "RECEPTION");
  const [autoPassword, setAutoPassword] = useState(true);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const title = isCreate
    ? "Add staff account"
    : isEdit
      ? "Edit staff details"
      : `Reset password — ${target?.name}`;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      if (isEdit && target) {
        const response = await fetch(`/api/users/${target.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            ...(isSelf ? {} : { role }),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(firstError(data) ?? "Could not save the staff details");
          return;
        }
        onSaved();
        onClose();
        return;
      }

      if (isCreate) {
        const response = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            role,
            temporaryPassword: autoPassword ? "" : password,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(firstError(data) ?? "Could not create the staff account");
          return;
        }
        onSaved();
        onCredential({
          name: data.user?.name ?? name,
          email: data.user?.email ?? email,
          password: data.temporaryPassword ?? password,
          generated: Boolean(data.generated),
        });
        return;
      }

      if (isReset && target) {
        const response = await fetch(`/api/users/${target.id}/password-reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword: autoPassword ? "" : password }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(firstError(data) ?? "Could not reset the password");
          return;
        }
        onSaved();
        onCredential({
          name: data.user?.name ?? target.name,
          email: data.user?.email ?? target.email,
          password: data.temporaryPassword ?? password,
          generated: Boolean(data.generated),
        });
      }
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-xl border border-line bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-sm font-semibold text-navy">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-page"
          >
            Close
          </button>
        </div>

        {credential ? (
          <div className="space-y-4 px-5 py-5">
            <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-bg px-4 py-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
              <p className="text-sm text-warning">
                Share this password with {credential.name} now — it is shown{" "}
                <strong>only once</strong>. They must change it at first sign-in.
              </p>
            </div>

            <dl className="space-y-2 rounded-lg border border-line bg-page px-4 py-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium text-navy">{credential.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Temporary password</dt>
                <dd className="font-mono text-base font-semibold text-navy">
                  {credential.password}
                </dd>
              </div>
            </dl>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(credential.password);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
                {copied ? "Copied" : "Copy password"}
              </button>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5" noValidate>
            {(isCreate || isEdit) && !isReset ? (
              <>
                <div>
                  <label htmlFor="staff-name" className="field-label">
                    Full name
                  </label>
                  <input
                    id="staff-name"
                    className="input w-full"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                  />
                </div>
                <div>
                  <label htmlFor="staff-email" className="field-label">
                    Email (used to sign in)
                  </label>
                  <input
                    id="staff-email"
                    type="email"
                    className="input w-full"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="staff-role" className="field-label">
                    Hospital Role
                  </label>
                  <select
                    id="staff-role"
                    className="input w-full"
                    value={role}
                    disabled={isSelf}
                    onChange={(e) => setRole(e.target.value as Role)}
                  >
                    <option value="ADMIN">Administrator — Full Access & Settings</option>
                    <option value="DOCTOR">Doctor — OPD/IPD Care, Prescriptions & Labs</option>
                    <option value="RECEPTION">Receptionist — Registrations, Appointments & Billing</option>
                    {target?.role && !["ADMIN", "DOCTOR", "RECEPTION"].includes(target.role) ? (
                      <option value={target.role}>
                        {ROLE_LABELS[target.role]}
                      </option>
                    ) : null}
                  </select>
                  {isSelf ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      You cannot change your own role.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Active hospital access is standardized to Administrator, Doctor, and Receptionist roles.
                    </p>
                  )}
                </div>
              </>
            ) : null}

            {!isEdit ? (
              <fieldset className="space-y-2 rounded-lg border border-line bg-page p-3">
                <legend className="px-1 text-xs font-medium text-muted-foreground">
                  {isReset ? "New password" : "Temporary password"}
                </legend>
                <label className="flex items-center gap-2 text-sm text-navy">
                  <input
                    type="radio"
                    name="password-mode"
                    checked={autoPassword}
                    onChange={() => setAutoPassword(true)}
                  />
                  Generate a secure password automatically
                </label>
                <label className="flex items-center gap-2 text-sm text-navy">
                  <input
                    type="radio"
                    name="password-mode"
                    checked={!autoPassword}
                    onChange={() => setAutoPassword(false)}
                  />
                  Type a temporary password
                </label>
                {!autoPassword ? (
                  <>
                    <input
                      className="input w-full"
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      placeholder="e.g. Ahlain2026"
                    />
                    <p className="text-xs text-muted-foreground">{PASSWORD_RULES}</p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    A readable one-time password will be shown after saving.
                  </p>
                )}
              </fieldset>
            ) : null}

            {error ? (
              <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {isCreate ? "Create account" : isEdit ? "Save changes" : "Reset password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function PermissionsDialog({
  user,
  onClose,
  onSaved,
}: {
  user: StaffRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const roleDefaults = new Set<PermissionKey>(ROLE_PERMISSION_DEFAULTS[user.role]);
  const [selected, setSelected] = useState<Set<PermissionKey>>(
    () => new Set(user.permissions),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: PermissionKey) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/users/${user.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: [...selected] }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = data.details as Record<string, string[]> | null;
        const first = details ? Object.values(details).flat().find(Boolean) : null;
        setError(first ?? data.error ?? "Could not save permissions");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Permissions — ${user.name}`}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-line bg-white shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-line px-5 py-3.5">
          <div>
            <h3 className="text-sm font-semibold text-navy">
              Permissions — {user.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Role: {ROLE_LABELS[user.role]} · changes apply immediately and are audit logged
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-page"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {PERMISSION_GROUPS.map((group) => {
            const keys = PERMISSION_KEYS.filter(
              (key) => PERMISSION_CATALOG[key].group === group,
            );
            if (keys.length === 0) return null;
            return (
              <fieldset key={group} className="rounded-lg border border-line">
                <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </legend>
                <div className="divide-y divide-line">
                  {keys.map((key) => {
                    const meta = PERMISSION_CATALOG[key];
                    const isDefault = roleDefaults.has(key);
                    return (
                      <label
                        key={key}
                        className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm hover:bg-page"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4"
                          checked={selected.has(key)}
                          onChange={() => toggle(key)}
                        />
                        <span className="min-w-0">
                          <span className="font-medium text-navy">{meta.label}</span>
                          {isDefault ? (
                            <span className="ml-2 rounded bg-page px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Role default
                            </span>
                          ) : null}
                          <span className="block text-xs text-muted-foreground">
                            {meta.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>

        {error ? (
          <p role="alert" className="mx-5 mb-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3.5">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setSelected(new Set(roleDefaults))}
          >
            Reset to role defaults
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Save permissions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function firstError(data: { error?: string; details?: Record<string, string[]> | null }) {
  if (data.details) {
    const first = Object.values(data.details).flat().find(Boolean);
    if (first) return first;
  }
  return data.error ?? null;
}
