import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { transferAdmissionSchema } from "@/modules/ip/schemas";
import { transferAdmission } from "@/modules/ip/service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiPermission("ip.access");
    const { id } = await params;
    const input = await parseBody(transferAdmissionSchema, req);
    const result = await transferAdmission(id, input, user);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
