import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError, parseBody } from "@/modules/shared/api";
import { bedSchema } from "@/modules/ip/schemas";
import { createBed, listBeds } from "@/modules/ip/service";

export async function GET() {
  try {
    await requireApiPermission("ip.access");
    const beds = await listBeds();
    return NextResponse.json({ items: beds, total: beds.length });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiPermission("ip.access");
    const input = await parseBody(bedSchema, req);
    const bed = await createBed(input, user);
    return NextResponse.json({ bed }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
