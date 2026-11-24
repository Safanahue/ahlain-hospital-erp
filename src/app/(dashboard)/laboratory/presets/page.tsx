import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission, getPermissionsFor } from "@/modules/auth/guards";
import { listTemplates } from "@/modules/laboratory/presets";
import LabPresetManager from "./LabPresetManager";

export const dynamic = "force-dynamic";

export default async function LabPresetsPage() {
  const user = await requirePagePermission("lab.access");
  const permissions = await getPermissionsFor(user);
  const templates = await listTemplates({ includeInactive: true });
  const canManage = permissions.has("lab.masters");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/laboratory"
          className="inline-flex items-center gap-2 text-sm font-medium text-medical hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Laboratory
        </Link>
        <p className="page-note">
          {templates.length} report preset{templates.length === 1 ? "" : "s"} · reference ranges are
          editable and editable per age &amp; gender
        </p>
      </div>

      <LabPresetManager
        canManage={canManage}
        initialTemplates={templates.map((template) => ({
          id: template.id,
          name: template.name,
          category: template.category,
          description: template.description,
          active: template.active,
          parameters: template.parameters.map((parameter) => ({
            id: parameter.id,
            section: parameter.section,
            name: parameter.name,
            unit: parameter.unit,
            dataType: parameter.dataType as "NUMERIC" | "TEXT",
            sortOrder: parameter.sortOrder,
            ranges: parameter.ranges.map((range) => ({
              gender: range.gender as "Male" | "Female" | "Both",
              ageMinYears: range.ageMinYears,
              ageMaxYears: range.ageMaxYears,
              minValue: range.minValue,
              maxValue: range.maxValue,
              displayRange: range.displayRange,
              notes: range.notes,
            })),
          })),
        }))}
      />
    </div>
  );
}
