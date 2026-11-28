import { NextResponse } from "next/server";
import { requireApiPermission } from "@/modules/auth/guards";
import { handleApiError } from "@/modules/shared/api";
import { getOrderReport } from "@/modules/laboratory/results";
import { buildLabReportPdf } from "@/modules/laboratory/report-pdf";
import { getHospitalSettings } from "@/modules/billing/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiPermission("lab.access");
    const { id } = await params;
    const [order, settings] = await Promise.all([getOrderReport(id), getHospitalSettings()]);
    if (!order) {
      return NextResponse.json({ error: "Lab order not found" }, { status: 404 });
    }

    const bytes = await buildLabReportPdf(order, {
      hospitalName: settings.hospitalName,
      addressLine1: settings.address,
      phone: settings.phone,
    });

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${order.reportNo ?? order.orderNo}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
