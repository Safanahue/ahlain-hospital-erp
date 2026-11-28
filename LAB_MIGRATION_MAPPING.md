# Lab Migration Mapping

How Xpertz laboratory data maps onto the Ahlain laboratory module, and what has
actually been imported so far.

## 1. Source → target field map

| Xpertz (`mk2.mdb` / `mk7.mdb`) | Ahlain (`prisma/schema.prisma`) | Notes |
| --- | --- | --- |
| `Registration.id_no` + `heamatology.DepNum` | `LabOrder.sourceRef` = `xpertz:<id_no>\|<DepNum>` `@unique` | stable accession key, identical in every backup |
| `Registration.bill_no` / `DepNum` (`GP-1575-25`) | `LabOrder.orderNo` = `XP-GP-1575-25`, `LabOrder.reportNo` = `GP-1575-25` | prefixed so migrated accessions can never collide with `AH-LAB-…` |
| `Registration.ddate` + `regtime` | `LabOrder.createdAt`, `LabOrder.sampleCollectedAt` | historical date preserved verbatim, never replaced with import date |
| `heamatology.reporttime` | `LabOrder.verifiedAt` | the Xpertz report time becomes the verification time |
| `Registration.name` (mangled, e.g. `SUHARA BEEVI  (83,FEMALE)`) | `LabOrder.patientId` | matched against `Patient` after stripping parentheticals and non-letters; age/sex used as tiebreak |
| `Registration.sex` / `age` | not stored on the order | used only to confirm the patient match |
| `Registration.doctor` | `LabOrder.findings` = `Historic referral: Dr.HAKEEM PAREED` | kept as text; not linked to a `User` |
| `testgroup` / `DepNum` department text | `LabOrder.department` (first) + `LabOrderTest` rows | `GENARAL`/`GENERAL` and `URINE ANALYSIS`/`URINEANALYSIS` are normalised in code only |
| `Registration.total` (4 implied decimals) | `LabOrder.costPaise` = `total / 100` | integer paise, no recalculation |
| `heamatology` row (`parameter`, `value`, `unit`, `refrange`) | `LabOrderResult(parameterName, resultValue, unit, referenceRange)` | verbatim; `flag` left `NONE` because the source has no flag |
| — (no source column) | `LabOrder.status` = `VERIFIED` | historical reports were already released |
| — (no source column) | `LabOrder.sourceSystem` = `XPERTZ_MK7` / `XPERTZ_MK2`, `sourceTable` = `heamatology` | provenance |
| — (no source invoice) | `LabOrder.invoiceId` = `NULL` | see §4 |
| PDF file in `new/LAB REPORTS` / `new/Email Report` | `LabReportDocument.bytes` + `sha256` `@unique` | see LAB_PDF_INVENTORY.md |

## 2. Schema additions (additive only)

Added to `prisma/schema.prisma`; nothing existing was renamed or dropped:

- `LabOrder`: `department, priority, sampleId, sampleCollectedBy, sampleRejectedAt,
  sampleRejectionReason, reportNo, invoiceId @unique, sourceSystem, sourceRef @unique,
  sourceTable` + relations `tests`, `documents`, `invoice`.
- `LabOrderTest` (new): one row per test in an accession (multi-test support).
- `LabReportDocument` (new): archived PDFs as `Bytes`, `sha256 @unique`.
- `Patient.labDocuments`, `Invoice.labOrder` back-relations.

Applied to the **local development database only** with
`npx prisma db push --accept-data-loss` (the only destructive part is that new
unique indexes are built on new nullable columns). **Production is untouched.**

## 3. Staged volume vs imported volume

Export: `python scripts/export-xpertz-labs.py mk2.mdb` → `docs/xpertz-staging/labs-mk2.jsonl`
(1,021 accessions, 13,487 result lines). `labs-mk7.jsonl` (1,001 / 13,246) is kept
for comparison but **mk2 is the superset and is the file to use**.

Importer dry run (`node scripts/import-xpertz-labs.mjs --file docs/xpertz-staging/labs-mk2.jsonl`):

| Bucket | Accessions |
| --- | ---: |
| In staging file | 1,021 |
| Already imported (dedupe hit) | 12 |
| Matched to an Ahlain patient | 508 |
| Ambiguous (2+ patients share the name) | 115 |
| Unmatched (no patient, or age/sex conflict) | 386 |
| Planned new `LabOrderTest` rows | 902 |
| Planned new `LabOrderResult` rows | 7,003 |

Applied to the local database so far: **12 accessions**, 20 test rows, 125 result
lines — a deliberate pilot to prove dates, results, ranges and dedupe before a full
run. Verified in the DB afterwards: `orderNo = XP-GP-1575-25`, `sourceRef =
xpertz:26013|GP-1575-25`, `createdAt = 2025-12-31`, results such as
`178 mg/dl` with range `70 -140 mg/dl`.

## 4. Decisions that protect data fidelity

1. **No invented patients.** 501 accessions (115 + 386) are not imported. Creating
   a patient row to "make the lab report fit" would fabricate a clinical identity.
2. **No invented invoices.** Xpertz has registration fees but no invoice/receipt
   identity, so migrated accessions keep `costPaise` on the order and get **no**
   `Invoice`. The "one LAB invoice per accession, no duplicates" rule applies to
   **new** accessions raised inside Ahlain (`createLabOrder` creates the invoice in
   the same transaction, `LabOrder.invoiceId @unique`).
3. **No invented results or ranges.** Values, units and ranges come from
   `heamatology` verbatim; missing ranges stay `NULL`.
4. **Idempotent import.** `sourceRef` is canonical (`xpertz:…`, independent of
   which backup file was read), so importing mk2 after mk7 skips the 12 rows
   already present instead of duplicating them. `LabReportDocument.sha256` does
   the same for PDFs.
5. **Historical dates preserved.** Accessions are dated 2025-12/2026-01 in the
   source, not by the import run.

## 5. Validation queries

```sql
-- imported accessions and their dates
select "orderNo", "sourceRef", "createdAt" from "LabOrder" where "sourceRef" is not null;
-- no duplicate accessions
select "sourceRef", count(*) from "LabOrder" where "sourceRef" is not null group by 1 having count(*) > 1;
-- result lines per imported accession
select count(*) from "LabOrderResult" r join "LabOrder" o on o.id = r."orderId" where o."sourceRef" is not null;
-- archived PDFs
select "matchConfidence", count(*) from "LabReportDocument" group by 1;
```

First three return: 12 rows, 0 rows, 125.
