"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Loader2, ShieldCheck } from "lucide-react";

export default function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = data.details as Record<string, string[]> | null;
        const first = details ? Object.values(details).flat().find(Boolean) : null;
        setError(first ?? data.error ?? "Could not change the password");
        return;
      }

      // The session token carries the old flag, so sign out and sign in again.
      await signOut({ callbackUrl: "/login?changed=1" });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {forced ? (
        <div className="flex items-start gap-2 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Your administrator issued a temporary password. Choose your own
            password to unlock the ERP.
          </p>
        </div>
      ) : null}

      <div>
        <label htmlFor="current-password" className="field-label">
          Current password
        </label>
        <input
          id="current-password"
          type="password"
          className="input w-full"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>

      <div>
        <label htmlFor="new-password" className="field-label">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          className="input w-full"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          At least 8 characters, including a letter and a number.
        </p>
      </div>

      <div>
        <label htmlFor="confirm-password" className="field-label">
          Confirm new password
        </label>
        <input
          id="confirm-password"
          type="password"
          className="input w-full"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 pt-1">
        <Link href="/" className="text-sm font-medium text-medical hover:underline">
          Back to dashboard
        </Link>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Save new password
        </button>
      </div>
    </form>
  );
}
