import { Plus, Search } from "lucide-react";
import { requirePagePermission, getPermissionsFor } from "@/modules/auth/guards";
import { serviceListQuerySchema } from "@/modules/catalog/schemas";
import { listServices } from "@/modules/catalog/queries";
import { formatINR } from "@/modules/shared/money";
import { StatusBadge } from "@/modules/shared/components/Badges";
import Pagination from "@/modules/shared/components/Pagination";
import ServiceFormDialog from "@/modules/catalog/components/ServiceFormDialog";
import ServiceToggle from "@/modules/catalog/components/ServiceToggle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const DEPARTMENT_OPTIONS = [
  { value: "OP", label: "OP" },
  { value: "IP", label: "IP" },
  { value: "LAB", label: "Lab" },
  { value: "PHARMACY", label: "Pharmacy" },
  { value: "DENTAL", label: "Dental" },
];

const CATEGORY_OPTIONS = [
  { value: "SERVICE_CHARGES", label: "Service charges" },
  { value: "LABORATORY", label: "Laboratory" },
  { value: "PHARMACY", label: "Pharmacy" },
  { value: "ROOM_CHARGES", label: "Room charges" },
  { value: "DOCTOR_CONSULTATION", label: "Doctor consultation" },
  { value: "OTHER_CHARGES", label: "Other charges" },
];

const DEPARTMENT_LABELS: Record<string, string> = Object.fromEntries(
  DEPARTMENT_OPTIONS.map((opt) => [opt.value, opt.label]),
);
const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((opt) => [opt.value, opt.label]),
);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ServiceCatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = {
    page: first(sp.page) ?? "1",
    pageSize: "12",
    q: first(sp.q),
    department: first(sp.department),
    category: first(sp.category),
    active: first(sp.active),
  };

  const parsed = serviceListQuerySchema.safeParse(raw);
  const query = parsed.success
    ? parsed.data
    : serviceListQuerySchema.parse({ page: 1, pageSize: 12 });

  const user = await requirePagePermission("services.view");
  const permissions = await getPermissionsFor(user);
  const canManage = permissions.has("services.manage");

  const result = await listServices(query);
  const hasFilters = Boolean(
    query.q || query.department || query.category || query.active !== undefined,
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <p className="page-note">
          {result.total} service{result.total === 1 ? "" : "s"}
          {hasFilters ? " matching your filters" : " in total"} · prices are
          stored as integer paise
        </p>
        {canManage ? (
          <ServiceFormDialog
            service={null}
            trigger={
              <button type="button" className="btn btn-primary">
                <Plus className="h-4 w-4" aria-hidden />
                New service
              </button>
            }
          />
        ) : null}
      </div>

      {/* Filters — submitted as a GET form, applied server-side */}
      <form method="GET" action="/settings/services" className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1">
            <label htmlFor="q" className="field-label">
              Search
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={query.q ?? ""}
                placeholder="Service code or name"
                className="input w-full pl-9"
              />
            </div>
          </div>

          <div>
            <label htmlFor="department" className="field-label">
              Department
            </label>
            <select
              id="department"
              name="department"
              defaultValue={query.department ?? ""}
              className="input"
            >
              <option value="">All departments</option>
              {DEPARTMENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="category" className="field-label">
              Category
            </label>
            <select
              id="category"
              name="category"
              defaultValue={query.category ?? ""}
              className="input"
            >
              <option value="">All categories</option>
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="active" className="field-label">
              Status
            </label>
            <select
              id="active"
              name="active"
              defaultValue={
                query.active === undefined ? "" : query.active ? "true" : "false"
              }
              className="input"
            >
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-primary">
              Apply filters
            </button>
            {hasFilters ? (
              <a href="/settings/services" className="btn btn-secondary">
                Clear
              </a>
            ) : null}
          </div>
        </div>
      </form>

      {/* Service catalog table */}
      <section className="card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Service name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <p className="text-sm font-medium text-navy">
                      No services found
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {hasFilters
                        ? "Try adjusting your search or filters."
                        : "Services will appear here once they are created."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                result.items.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell className="font-medium text-navy">
                      {service.code}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-navy">
                        {service.name}
                      </span>
                      {service.description ? (
                        <span className="block text-xs text-muted-foreground">
                          {service.description}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {DEPARTMENT_LABELS[service.department] ??
                        service.department}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {CATEGORY_LABELS[service.category] ?? service.category}
                    </TableCell>
                    <TableCell className="text-right text-navy">
                      {formatINR(service.pricePaise)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={service.active ? "Active" : "Inactive"}
                        tone={service.active ? "success" : "neutral"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage ? (
                        <div className="flex items-center justify-end gap-2">
                          <ServiceFormDialog
                            service={{
                              id: service.id,
                              code: service.code,
                              name: service.name,
                              description: service.description,
                              department: service.department,
                              category: service.category,
                              pricePaise: service.pricePaise,
                              active: service.active,
                            }}
                            trigger={
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                              >
                                Edit
                              </button>
                            }
                          />
                          <ServiceToggle
                            service={{
                              id: service.id,
                              name: service.name,
                              active: service.active,
                            }}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <Pagination
          basePath="/settings/services"
          query={{
            q: query.q,
            department: query.department,
            category: query.category,
            active:
              query.active === undefined
                ? undefined
                : query.active
                  ? "true"
                  : "false",
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
