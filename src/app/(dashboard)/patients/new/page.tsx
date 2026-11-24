import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/modules/auth/guards";
import PatientForm from "@/modules/patients/components/PatientForm";

export const dynamic = "force-dynamic";

export default async function NewPatientPage() {
  await requirePagePermission("patients.manage");

  return (
    <div className="space-y-5">
      <Link
        href="/patients"
        className="inline-flex items-center gap-2 text-sm font-medium text-medical hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to patients
      </Link>
      <PatientForm mode="create" />
    </div>
  );
}
