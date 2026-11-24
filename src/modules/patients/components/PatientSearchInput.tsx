"use client";

import { useRouter } from "next/navigation";
import PatientAutocomplete, { type PatientSearchResult } from "./PatientAutocomplete";

export default function PatientSearchInput({
  defaultValue = "",
}: {
  defaultValue?: string;
}) {
  const router = useRouter();

  return (
    <PatientAutocomplete
      id="q"
      name="q"
      defaultValue={defaultValue}
      placeholder="Type patient name, UHID, or phone to live search…"
      showDetailsCard={false}
      onSelect={(patient) => {
        if (patient) {
          router.push(`/patients/${patient.id}`);
        }
      }}
      onNavigateOnSelect={(patient) => {
        router.push(`/patients/${patient.id}`);
      }}
    />
  );
}
