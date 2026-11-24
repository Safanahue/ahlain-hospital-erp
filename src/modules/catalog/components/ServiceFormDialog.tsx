"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { rupeesToPaise } from "@/modules/shared/money";

const DEPARTMENTS = [
  { value: "OP", label: "OP" },
  { value: "IP", label: "IP" },
  { value: "LAB", label: "Lab" },
  { value: "PHARMACY", label: "Pharmacy" },
  { value: "DENTAL", label: "Dental" },
];

const CATEGORIES = [
  { value: "SERVICE_CHARGES", label: "Service Charges" },
  { value: "LABORATORY", label: "Laboratory" },
  { value: "PHARMACY", label: "Pharmacy" },
  { value: "ROOM_CHARGES", label: "Room Charges" },
  { value: "DOCTOR_CONSULTATION", label: "Doctor Consultation" },
  { value: "OTHER_CHARGES", label: "Other Charges" },
];

export type CatalogService = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  department: string;
  category: string;
  pricePaise: number;
  active: boolean;
};

/**
 * Create/edit dialog for one Service Catalog row.
 * `service === null` creates a new entry; otherwise it edits the given row.
 * The caller supplies the trigger element (row button or "New service").
 */
export default function ServiceFormDialog({
  service,
  trigger,
}: {
  service: CatalogService | null;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const isEdit = service !== null;

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("OP");
  const [category, setCategory] = useState("SERVICE_CHARGES");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function handleOpen(next: boolean) {
    if (next && !open) {
      setCode(service?.code ?? "");
      setName(service?.name ?? "");
      setDescription(service?.description ?? "");
      setDepartment(service?.department ?? "OP");
      setCategory(service?.category ?? "SERVICE_CHARGES");
      setPrice(service ? (service.pricePaise / 100).toFixed(service.pricePaise % 100 === 0 ? 0 : 2) : "");
      setError(null);
    }
    setOpen(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);

    if (!code.trim()) {
      setError("Service code is required.");
      return;
    }
    if (!name.trim()) {
      setError("Service name is required.");
      return;
    }
    const pricePaise = rupeesToPaise(price);
    if (pricePaise === null) {
      setError("Enter a valid price, e.g. 500 or 500.50.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch(
        isEdit ? `/api/services/${service.id}` : "/api/services",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: code.trim(),
            name: name.trim(),
            description: description.trim(),
            department,
            category,
            pricePaise,
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const firstIssue = data.details
          ? Object.values(data.details).flat()[0]
          : null;
        setError((firstIssue as string) ?? data.error ?? "Could not save the service.");
        setPending(false);
        return;
      }
      setPending(false);
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error — the service was not saved.");
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit service" : "New service"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? `Update ${service.code} — changes are audit logged.`
                : "Add a billable service to the hospital price list."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="service-code" className="field-label">
                Code
              </label>
              <input
                id="service-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                readOnly={isEdit}
                placeholder="e.g. OP-CONSULT"
                className="input w-full disabled:text-muted-foreground"
                autoComplete="off"
              />
              {isEdit ? (
                <p className="field-help">Codes are permanent references.</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="service-name" className="field-label">
                Service name
              </label>
              <input
                id="service-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. OP Consultation"
                className="input w-full"
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="service-department" className="field-label">
                Department
              </label>
              <select
                id="service-department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="input w-full"
              >
                {DEPARTMENTS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="service-category" className="field-label">
                Category
              </label>
              <select
                id="service-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input w-full"
              >
                {CATEGORIES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="service-price" className="field-label">
                Price (₹)
              </label>
              <input
                id="service-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 500"
                className="input w-full"
                autoComplete="off"
              />
              <p className="field-help">Stored as integer paise on the server.</p>
            </div>

            <div>
              <label htmlFor="service-description" className="field-label">
                Description{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <textarea
                id="service-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short note shown on bills"
                className="textarea w-full"
              />
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : isEdit ? null : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
              {isEdit ? "Save changes" : "Create service"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
