import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { createAdmissionSchema } from "@/modules/ip/schemas";
import { createAdmission, listAdmissions } from "@/modules/ip/service";

export async function GET(req: Request) {
  try {
    await requireApiPermission("ip.access");
    const url = new URL(req.url);
    const result = await listAdmissions(Object.fromEntries(url.searchParams));
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiPermission("ip.access");
    const input = await parseBody(createAdmissionSchema, req);
    const admission = await createAdmission(input, user);
    return NextResponse.json({ admission }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
