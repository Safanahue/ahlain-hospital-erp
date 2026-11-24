import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody, parseQuery } from "@/modules/shared/api";
import { createServiceSchema, serviceListQuerySchema } from "@/modules/catalog/schemas";
import { createService } from "@/modules/catalog/service";
import { listServices } from "@/modules/catalog/queries";

/** GET /api/services — paginated, searchable, filterable service catalog list. */
export async function GET(req: Request) {
  try {
    await requireApiPermission("services.view");
    const query = parseQuery(serviceListQuerySchema, req);
    const result = await listServices(query);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/services — create a catalog entry (Admin, Billing Staff). */
export async function POST(req: Request) {
  try {
    const user = await requireApiPermission("services.manage");
    const input = await parseBody(createServiceSchema, req);
    const service = await createService(input, user);
    return NextResponse.json({ service }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
