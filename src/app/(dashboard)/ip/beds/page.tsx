import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission, getPermissionsFor } from "@/modules/auth/guards";
import { listBeds } from "@/modules/ip/service";
import BedManager from "./BedManager";

export const dynamic = "force-dynamic";

export default async function BedsPage() {
  const user = await requirePagePermission("ip.access");
  const permissions = await getPermissionsFor(user);
  const beds = await listBeds();
  const canManage = permissions.has("ip.access");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/ip"
          className="inline-flex items-center gap-2 text-sm font-medium text-medical hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          IP admissions
        </Link>
        <p className="page-note">
          {beds.length} bed{beds.length === 1 ? "" : "s"} ·{" "}
          {beds.filter((bed) => bed.status === "AVAILABLE").length} available
        </p>
      </div>

      <BedManager
        canManage={canManage}
        initialBeds={beds.map((bed) => ({
          id: bed.id,
          bedNumber: bed.bedNumber,
          ward: bed.ward,
          roomNo: bed.roomNo,
          floor: bed.floor,
          dailyRatePaise: bed.dailyRatePaise,
          status: bed.status,
          occupant: bed.admissions[0]
            ? {
                name: bed.admissions[0].patient.name,
                uhid: bed.admissions[0].patient.uhid,
                admissionNo: bed.admissions[0].admissionNo,
                admissionId: bed.admissions[0].id,
              }
            : null,
        }))}
      />
    </div>
  );
}
