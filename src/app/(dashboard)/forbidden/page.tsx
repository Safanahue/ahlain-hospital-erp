import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function ForbiddenPage() {
  return (
    <div className="card mx-auto max-w-lg p-10 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-danger">
        Access denied
      </p>
      <h1 className="mt-2 text-lg font-semibold text-navy">
        You don&apos;t have permission to view this page
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your role does not include access to this area. If you believe this is a
        mistake, contact an administrator.
      </p>
      <Link
        href="/"
        className="btn btn-primary mt-6"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to dashboard
      </Link>
    </div>
  );
}
