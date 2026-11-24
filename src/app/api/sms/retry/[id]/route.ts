import { NextResponse } from "next/server";
import { requireApiUser } from "@/modules/auth/guards";
import { retrySmsDispatch } from "@/modules/communication/sms-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser(["ADMIN"]);
    const { id } = await params;

    const result = await retrySmsDispatch(id, user);
    return NextResponse.json({ success: true, item: result });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to retry SMS" },
      { status: err.status || 500 },
    );
  }
}
