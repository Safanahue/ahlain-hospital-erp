# Pharmacy History Mapping

What pharmacy history exists in the sources, how the patient profile splits it,
and why most of the five buckets are empty for historical patients.

## 1. What the sources contain

### Xpertz (7 Access databases) — no pharmacy data at all

| Table | Rows (mk1…mk7) | Meaning |
| --- | ---: | --- |
| `pharmacies` | 0 | pharmacy master |
| `stock` | 2 | two stock stub rows |
| `qtstock` | 4 | four quantity stub rows |
| `stock_adj` | 0 | stock adjustments |
| `purchase`, `purchase_master`, `purchase_pay` | 0 / 0 / 0 | purchases |
| `qtpurchase`, `qtpurchase_master`, `qtpurchase_pay` | 0 | quotations |
| `qtpurchaseret*` | 0 | purchase returns |
| `qtsales`, `qtsales_master`, `qtsales_pay` | 0 / 0 / 0 | sales |
| `qtsalesret*` | 0 | sales returns |

The pharmacy tables exist in the schema but were **never used** in this
installation. There is no historical dispense, sale, purchase or return to migrate.

### Invosoft HMIS export (already imported)

| Table (local) | Rows | Note |
| --- | ---: | --- |
| `Medicine` | 4,234 | medicine master, imported |
| `Prescription` | 2 | both created by the lab test suite, not history |
| `PrescriptionItem` | 2 | same |

Invosoft's medicine master came across, but **prescriptions did not** — the source
had none to export. So there is no historical prescribing, dispensing, purchasing
or returning trail. A prescription is also **not** proof of dispensing, so no
bucket may be filled from the other one.

## 2. How the profile splits pharmacy history

The Pharmacy tab is deliberately split into five lists, each labelled, and each
reading a different fact:

| Bucket | Meaning | Source |
| --- | --- | --- |
| **Prescribed** | a clinician wrote it | `Prescription` + `PrescriptionItem` |
| **Dispensed** | stock actually left the counter against a prescription | `PrescriptionItem.dispensedQuantity` > 0, with `dispensedAt`/`dispensedBy` |
| **Purchased** | bought at the counter with no prescription | pharmacy sale/invoice, `invoiceId` on the dispense record |
| **Returned** | came back to stock | `PrescriptionItem.returnedQuantity` > 0 |
| **Cancelled** | voided before or after partial dispense | `Prescription.status = CANCELLED` |

Schema support added (additive, nullable):
`PrescriptionItem.dispensedQuantity Int @default(0)` and
`PrescriptionItem.returnedQuantity Int @default(0)`, which make **partial**
dispensing and partial returns representable rather than forcing an all-or-nothing
"dispensed" flag.

For historical patients all five lists are empty, and the tab says so. It does not
infer a dispense from a prescription, and it does not infer a purchase from an
invoice line description.

## 3. Forward behaviour (new activity, not history)

New pharmacy activity recorded inside Ahlain does populate these lists:

- `POST /api/pharmacy/prescriptions` creates a prescription (status `PENDING`).
- `POST /api/pharmacy/prescriptions/[id]/dispense` writes dispensed quantities
  against stock, supports partial dispense, and records the dispenser.
- `POST /api/pharmacy/prescriptions/[id]/cancel` voids the remainder without
  deleting the record, so a cancelled prescription still appears in history.
- `GET/POST /api/pharmacy/medicines` and `[id]` manage the master and stock.

Stock movements are validated against `Medicine` stock; a dispense that would take
stock below zero is rejected rather than silently allowed.

## 4. Verification

```
select count(*) from "Medicine";               -- 4,234
select count(*) from "Prescription";           -- 2   (test rows)
select count(*) from "PrescriptionItem";       -- 2   (test rows)
```

Xpertz: every purchase/sale/return table = 0 rows, verified in
`docs/xpertz-tables.json` for all seven databases.

## 5. Recommendation

If the hospital wants historical pharmacy history, it must supply a dispense or
sales export from whichever system actually ran the pharmacy counter. Nothing in
`new.zip`, `LabSoft.zip` or `copy1.zip` contains it, so no amount of re-reading
these archives will produce it.
