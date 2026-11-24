import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/modules/auth/guards";
import { prisma } from "@/lib/prisma";
import CreateInvoiceForm from "@/modules/billing/components/CreateInvoiceForm";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ pq?: string }>;
}) {
  await requirePagePermission("billing.create");
  const { pq } = await searchParams;
  const search = (pq ?? "").trim();

  const patients = await prisma.patient.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { uhid: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
    take: 100,
    select: { id: true, name: true, uhid: true, phone: true },
  });

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
        <form method="GET" action="/billing/invoices/new" className="flex items-center gap-2">
          <label htmlFor="pq" className="sr-only">
            Find patient
          </label>
          <input
            id="pq"
            name="pq"
            defaultValue={search}
            placeholder="Find patient by name, UHID or phone"
            className="input w-80"
          />
          <button type="submit" className="btn btn-secondary">
            Search
          </button>
        </form>
      </div>

      <CreateInvoiceForm patients={patients} />
    </div>
  );
}
