export default function ComingSoon({ module }: { module: string }) {
  return (
    <div className="card mx-auto max-w-lg p-10 text-center">
      <span className="inline-flex items-center rounded-full bg-warning-bg px-2.5 py-1 text-xs font-medium text-warning">
        Coming soon
      </span>
      <h1 className="mt-3 text-lg font-semibold text-navy">{module}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This module is not part of Phase 1. It will be delivered in a later
        phase — the data model is already in place.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Phase 1 includes the app foundation and the Billing &amp; Payments
        module.
      </p>
    </div>
  );
}
