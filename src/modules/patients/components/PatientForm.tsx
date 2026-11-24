"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";

const GENDERS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

const BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
];

/** Date → <input type="date"> value using the UTC calendar date. */
export function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export type FormPatient = {
  id: string;
  name: string;
  phone: string;
  age: number;
  gender: string;
  dob: Date | null;
  bloodGroup: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

/**
 * Registration / edit form for one patient. Used by /patients/new
 * (mode="create") and /patients/:id/edit (mode="edit"); both submit through
 * the patients API and land on the 360 view.
 */
export default function PatientForm({
  mode,
  patient,
}: {
  mode: "create" | "edit";
  patient?: FormPatient;
}) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [name, setName] = useState(patient?.name ?? "");
  const [phone, setPhone] = useState(patient?.phone ?? "");
  const [age, setAge] = useState(patient ? String(patient.age) : "");
  const [dob, setDob] = useState(toDateInputValue(patient?.dob));
  const [gender, setGender] = useState(patient?.gender ?? "MALE");
  const [bloodGroup, setBloodGroup] = useState(patient?.bloodGroup ?? "");
  const [address, setAddress] = useState(patient?.address ?? "");
  const [emergencyName, setEmergencyName] = useState(
    patient?.emergencyContactName ?? "",
  );
  const [emergencyPhone, setEmergencyPhone] = useState(
    patient?.emergencyContactPhone ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);

    const trimmedName = name.trim();
    const trimmedPhone = phone.replace(/[\s-]/g, "").replace(/^\+91/, "");
    if (!trimmedName) {
      setError("Patient name is required.");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(trimmedPhone)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    if (!dob && age.trim() === "") {
      setError("Enter the patient's age or date of birth.");
      return;
    }
    const ageNumber = age.trim() === "" ? undefined : Number(age.trim());
    if (ageNumber !== undefined && (!Number.isInteger(ageNumber) || ageNumber < 0 || ageNumber > 120)) {
      setError("Age must be a whole number between 0 and 120.");
      return;
    }
    if (emergencyPhone.trim()) {
      const emergency = emergencyPhone.replace(/[\s-]/g, "").replace(/^\+91/, "");
      if (!/^[6-9]\d{9}$/.test(emergency)) {
        setError("Enter a valid 10-digit emergency contact number.");
        return;
      }
    }

    setPending(true);
    try {
      const response = await fetch(
        isEdit ? `/api/patients/${patient!.id}` : "/api/patients",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            phone: trimmedPhone,
            ...(ageNumber !== undefined ? { age: ageNumber } : {}),
            dob,
            gender,
            bloodGroup,
            address: address.trim(),
            emergencyContactName: emergencyName.trim(),
            emergencyContactPhone: emergencyPhone.trim(),
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const firstIssue = data.details
          ? Object.values(data.details).flat()[0]
          : null;
        setError((firstIssue as string) ?? data.error ?? "Could not save the patient.");
        setPending(false);
        return;
      }
      router.push(`/patients/${data.patient.id}`);
      router.refresh();
    } catch {
      setError("Network error — the patient was not saved.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">{isEdit ? "Patient details" : "New patient"}</h2>
          <p className="card-subtitle">
            The UHID {isEdit ? "cannot be changed" : "is generated automatically"} · age
            is recalculated from the date of birth when both are given
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 px-5 py-4">
          <div className="col-span-2">
            <label htmlFor="patient-name" className="field-label">
              Full name
            </label>
            <input
              id="patient-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Patient full name"
              className="input w-full"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="patient-phone" className="field-label">
              Mobile number
            </label>
            <input
              id="patient-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile"
              inputMode="tel"
              className="input w-full"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="patient-age" className="field-label">
              Age{" "}
              {!dob ? (
                <span className="font-normal text-danger">(required)</span>
              ) : (
                <span className="font-normal text-muted-foreground">(optional)</span>
              )}
            </label>
            <input
              id="patient-age"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="e.g. 42"
              inputMode="numeric"
              className="input w-full"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="patient-dob" className="field-label">
              Date of birth{" "}
              {!age.trim() ? (
                <span className="font-normal text-danger">(required)</span>
              ) : (
                <span className="font-normal text-muted-foreground">(optional)</span>
              )}
            </label>
            <input
              id="patient-dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label htmlFor="patient-gender" className="field-label">
              Gender
            </label>
            <select
              id="patient-gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="input w-full"
            >
              {GENDERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="patient-blood" className="field-label">
              Blood group{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <select
              id="patient-blood"
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              className="input w-full"
            >
              <option value="">Unknown</option>
              {BLOOD_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2">
            <label htmlFor="patient-address" className="field-label">
              Address{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="patient-address"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="House, street, city, PIN"
              className="textarea w-full"
            />
          </div>

          <div>
            <label htmlFor="patient-emergency-name" className="field-label">
              Emergency contact{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              id="patient-emergency-name"
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
              placeholder="Contact name"
              className="input w-full"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="patient-emergency-phone" className="field-label">
              Emergency number{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              id="patient-emergency-phone"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              placeholder="10-digit mobile"
              inputMode="tel"
              className="input w-full"
              autoComplete="off"
            />
          </div>
        </div>

        {error ? (
          <div className="px-5 pb-4">
            <p
              role="alert"
              className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={() => router.push(isEdit ? `/patients/${patient!.id}` : "/patients")}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
            {isEdit ? "Save changes" : "Register patient"}
          </button>
        </div>
      </section>
    </form>
  );
}
