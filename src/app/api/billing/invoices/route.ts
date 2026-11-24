import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody, parseQuery } from "@/modules/shared/api";
import { createInvoiceSchema, invoiceListQuerySchema } from "@/modules/billing/schemas";
import { createInvoice } from "@/modules/billing/service";
import { listInvoices } from "@/modules/billing/queries";

/** GET /api/billing/invoices — paginated, searchable, filterable invoice list. */
export async function GET(req: Request) {
  try {
    await requireApiPermission("billing.view");
    const query = parseQuery(invoiceListQuerySchema, req);
    const result = await listInvoices(query);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/billing/invoices — create an invoice (Billing Staff, Accounts, Admin). */
export async function POST(req: Request) {
  try {
    const user = await requireApiPermission("billing.create");
    const input = await parseBody(createInvoiceSchema, req);
    const invoice = await createInvoice(input, user);
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
