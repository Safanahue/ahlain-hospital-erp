import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/modules/auth/guards";
import { prisma } from "@/lib/prisma";
import PatientForm from "@/modules/patients/components/PatientForm";

export const dynamic = "force-dynamic";

export default async function EditPatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("patients.manage");
  const { id } = await params;

  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) notFound();

  return (
    <div className="space-y-5">
      <Link
        href={`/patients/${patient.id}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-medical hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to patient details
      </Link>
      <PatientForm
        mode="edit"
        patient={{
          id: patient.id,
          name: patient.name,
          phone: patient.phone,
          age: patient.age,
          gender: patient.gender,
          dob: patient.dob,
          bloodGroup: patient.bloodGroup,
          address: patient.address,
          emergencyContactName: patient.emergencyContactName,
          emergencyContactPhone: patient.emergencyContactPhone,
        }}
      />
    </div>
  );
}
