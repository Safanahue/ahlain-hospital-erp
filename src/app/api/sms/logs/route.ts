import { NextResponse } from "next/server";
import { requireApiUser } from "@/modules/auth/guards";
import { getSmsLogs } from "@/modules/communication/sms-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(["ADMIN"]);
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status") || "ALL";
    const search = searchParams.get("q") || "";
    const take = Number(searchParams.get("take") || "50");
    const skip = Number(searchParams.get("skip") || "0");

    const data = await getSmsLogs({ status, search, take, skip });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch SMS logs" },
      { status: err.status || 500 },
    );
  }
}
