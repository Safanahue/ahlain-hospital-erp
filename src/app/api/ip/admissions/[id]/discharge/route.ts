import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { dischargeSchema } from "@/modules/ip/schemas";
import { dischargeAdmission } from "@/modules/ip/service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiPermission("ip.discharge");
    const { id } = await params;
    const input = await parseBody(dischargeSchema, req);
    const result = await dischargeAdmission(id, input, user);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
