"use client";

import PatientAutocomplete from "@/modules/patients/components/PatientAutocomplete";

/**
 * Live patient suggestions for the dashboard's "Search in this period" box.
 * The typed text (or the picked patient's name) is submitted as `q` when a
 * suggestion is chosen, so the period list narrows immediately.
 */
export default function PeriodSearchInput({
  defaultValue = "",
}: {
  defaultValue?: string;
}) {
  return (
    <PatientAutocomplete
      id="dw-q"
      name="q"
      hiddenFromQuery
      keepQueryOnSelect
      submitFormOnSelect
      showDetailsCard={false}
      defaultValue={defaultValue}
      placeholder="Type patient name, UHID or phone…"
      onSelect={() => {}}
    />
  );
}
