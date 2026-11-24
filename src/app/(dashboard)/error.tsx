"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="card max-w-md p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-danger">
          Something went wrong
        </p>
        <h1 className="mt-2 text-base font-semibold text-navy">
          We couldn&apos;t load this page
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please try again. If the problem keeps happening, contact support and
          quote reference: {error.digest ?? "n/a"}.
        </p>
        <button
          type="button"
          onClick={reset}
          className="btn btn-primary mt-5"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
