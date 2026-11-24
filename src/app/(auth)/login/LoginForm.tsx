"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import { safeInternalPath } from "@/modules/auth/landing";

type FieldErrors = { email?: string; password?: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRedirect = safeInternalPath(searchParams.get("callbackUrl"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function validate(): boolean {
    const next: FieldErrors = {};
    const cleanEmail = email.trim();
    if (!cleanEmail) next.email = "Enter your email address.";
    else if (!EMAIL_PATTERN.test(cleanEmail)) {
      next.email = "Enter a valid email address, for example name@ahlain.in.";
    }
    if (!password) next.password = "Enter your password.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    if (!validate()) return;

    setPending(true);
    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (!result || result.error) {
        setError(
          "Invalid email or password. Check your details and try again — after several failed attempts, contact the administrator.",
        );
        setPending(false);
        return;
      }

      // Role-aware start page; a safe callback URL wins when present.
      let destination = requestedRedirect ?? "/";
      if (!requestedRedirect) {
        try {
          const response = await fetch("/api/account/landing", {
            cache: "no-store",
          });
          if (response.ok) {
            const data = (await response.json()) as { path?: string };
            destination = safeInternalPath(data.path) ?? "/";
          }
        } catch {
          destination = "/";
        }
      }
      router.push(destination);
      router.refresh();
    } catch {
      setError("Could not sign in right now. Please try again.");
      setPending(false);
    }
  }

  return (
    <>
      {searchParams.get("changed") === "1" ? (
        <p
          role="status"
          className="mb-4 rounded-lg border border-success/20 bg-success-bg px-3 py-2 text-sm text-success"
        >
          Password updated. Sign in with your new password.
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="field-label">
            Email address
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (fieldErrors.email) {
                  setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }
              }}
              placeholder="you@ahlain.in"
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              className={`input w-full pl-9 ${fieldErrors.email ? "input-invalid" : ""}`}
            />
          </div>
          {fieldErrors.email ? (
            <p id="email-error" className="mt-1 text-xs text-danger">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="field-label mb-1.5">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="mb-1.5 text-xs font-medium text-medical hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <LockKeyhole
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (fieldErrors.password) {
                  setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
              placeholder="Enter your password"
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={
                fieldErrors.password ? "password-error" : undefined
              }
              className={`input w-full pl-9 pr-11 ${
                fieldErrors.password ? "input-invalid" : ""
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-navy"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
          {fieldErrors.password ? (
            <p id="password-error" className="mt-1 text-xs text-danger">
              {fieldErrors.password}
            </p>
          ) : null}
        </div>

        {error ? (
          <p
            role="alert"
            aria-live="polite"
            className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary btn-block h-[42px]"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </>
  );
}
