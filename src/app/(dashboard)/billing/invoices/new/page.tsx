import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/modules/auth/guards";
import CreateInvoiceForm from "@/modules/billing/components/CreateInvoiceForm";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  await requirePagePermission("billing.create");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/billing/invoices"
          className="inline-flex items-center gap-2 text-sm font-medium text-medical hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to invoices
        </Link>
      </div>

      <CreateInvoiceForm />
    </div>
  );
}
