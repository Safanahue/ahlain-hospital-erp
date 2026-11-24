import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requirePagePermission, getPermissionsFor } from "@/modules/auth/guards";
import { patientListQuerySchema } from "@/modules/patients/schemas";
import { listPatients } from "@/modules/patients/queries";
import { formatCalendarDate, formatDate } from "@/modules/shared/datetime";
import Pagination from "@/modules/shared/components/Pagination";
import PatientSearchInput from "@/modules/patients/components/PatientSearchInput";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

const GENDER_LABELS: Record<string, string> = Object.fromEntries(
  GENDER_OPTIONS.map((opt) => [opt.value, opt.label]),
);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = {
    page: first(sp.page) ?? "1",
    pageSize: "12",
    q: first(sp.q),
    gender: first(sp.gender),
  };

  const parsed = patientListQuerySchema.safeParse(raw);
  const query = parsed.success
    ? parsed.data
    : patientListQuerySchema.parse({ page: 1, pageSize: 12 });

  const user = await requirePagePermission("patients.view");
  const permissions = await getPermissionsFor(user);
  const canRegister = permissions.has("patients.manage");

  const result = await listPatients(query);
  const hasFilters = Boolean(query.q || query.gender);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <p className="page-note">
          {result.total} patient{result.total === 1 ? "" : "s"}
          {hasFilters ? " matching your filters" : " in total"} · UHIDs are
          generated automatically
        </p>
        {canRegister ? (
          <Link href="/patients/new" className="btn btn-primary">
            <Plus className="h-4 w-4" aria-hidden />
            New patient
          </Link>
        ) : null}
      </div>

      {/* Filters — submitted as a GET form, applied server-side */}
      <form method="GET" action="/patients" className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1">
            <label htmlFor="q" className="field-label">
              Search
            </label>
            <PatientSearchInput defaultValue={query.q ?? ""} />
          </div>

          <div>
            <label htmlFor="gender" className="field-label">
              Gender
            </label>
            <select
              id="gender"
              name="gender"
              defaultValue={query.gender ?? ""}
              className="input"
            >
              <option value="">All genders</option>
              {GENDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-primary">
              Apply filters
            </button>
            {hasFilters ? (
              <Link href="/patients" className="btn btn-secondary">
                Clear
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      {/* Patient directory */}
      <section className="card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>UHID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Blood group</TableHead>
                <TableHead>Date of birth</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center">
                    <p className="text-sm font-medium text-navy">
                      No patients found
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {hasFilters
                        ? "Try adjusting your search or filters."
                        : "Patients will appear here once they are registered."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                result.items.map((patient) => (
                  <TableRow key={patient.id}>
                    <TableCell className="font-medium text-navy">
                      {patient.uhid}
                    </TableCell>
                    <TableCell className="font-medium text-navy">
                      <Link
                        href={`/patients/${patient.id}`}
                        className="text-medical hover:underline"
                      >
                        {patient.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {patient.phone}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {patient.age}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {GENDER_LABELS[patient.gender] ?? patient.gender}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {patient.bloodGroup ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {patient.dob ? formatCalendarDate(patient.dob) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(patient.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canRegister ? (
                          <Link
                            href={`/patients/${patient.id}/edit`}
                            className="btn btn-secondary btn-sm"
                          >
                            Edit
                          </Link>
                        ) : null}
                        <Link
                          href={`/patients/${patient.id}`}
                          className="btn btn-medical btn-sm"
                        >
                          View
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <Pagination
          basePath="/patients"
          query={{
            q: query.q,
            gender: query.gender,
          }}
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          pageSize={result.pageSize}
        />
      </section>
    </div>
  );
}
