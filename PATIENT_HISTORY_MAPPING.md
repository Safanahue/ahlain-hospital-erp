# Patient History Mapping

What each section of the patient profile reads, where the data comes from, and
what is genuinely unavailable.

Profile page: `/patients/[id]` — seven tabs: **Overview, OP, IP, Laboratory,
Pharmacy, Billing, Timeline**.
Server module: `src/modules/patients/history.ts` → `getPatientClinicalHistory(patientId)`.
All queries are scoped by the patient id taken from the route, and the page is
behind the authenticated dashboard layout.

## 1. Tab-by-tab source map

| Tab | Source tables | What is shown |
| --- | --- | --- |
| Overview | `Patient` | UHID, name, gender, phone, address, blood group, allergies, created date, and live counts per tab. **Age is printed only when it exists on the patient row** — never derived from a guessed birth date. |
| OP | `Invoice` (`department = OP`), `OPVisit`, `Appointment` | OP invoice lines with date, department, items and amount; OP visit rows when present. |
| IP | `Admission`, `Invoice` (`department = IP`) | admission dates, ward/bed, discharge summary, IP invoices and payments. |
| Laboratory | `LabOrder` → `LabOrderTest`, `LabOrderResult`, `LabOrder.invoiceId`, `LabReportDocument` | every accession with its historical date, report number, department, test list, every result line (value, unit, reference range) and download links for archived PDFs. Imported Xpertz accessions appear here with their `XP-…` order number. |
| Pharmacy | `Prescription`/`PrescriptionItem`, dispense fields `dispensedQuantity`/`returnedQuantity`, `Medicine` stock source | split into **prescribed**, **dispensed**, **purchased** (added at the counter, no prescription), **returned**, **cancelled**. Each list states which of the five it is; the UI never merges a prescription into a "dispensed" claim. |
| Billing | `Invoice`, `InvoiceItem`, `Payment`, `Refund` | invoice number, date, department, total, paid, balance, status, and the payment/refund ledger. |
| Timeline | union of all of the above | one chronological list with type filters (OP / IP / Lab / Pharmacy / Billing), each entry linked to its record. |

## 2. Verified behaviour (local database)

- Patient with an imported accession: Lab tab lists `XP-GP-…` accessions with
  their 2025-12 dates and full result lines; the report page opens and the PDF
  route returns `application/pdf`.
- Billing tab reconciles: `Invoice.totalAmount`, sum of `Payment` rows and
  `paidAmount` agree for the imported Invosoft invoices (₹79,25,708 billed,
  ₹79,25,708 paid per production snapshot).
- Timeline includes imported lab accessions next to imported invoices, ordered by
  the record's own date.
- Totals used by Overview come from the same queries, so a tab cannot show more
  rows than its count.

## 3. Known data limitations (documented, not hidden)

1. **Mangled legacy names.** Many Invosoft-era patients are stored as
   `MOHSINABDULLA  (35,MALE)` with `age = 30`, `gender = OTHER`. The profile
   therefore shows `Other · 30 years` for those rows. This is pre-existing source
   damage from the earlier import, not something the profile invents; the importer
   for lab data *parses* that pattern to recover the real age/sex for matching, but
   it does not rewrite the patient master.
2. **No OP visit rows.** Locally `OPVisit = 0`, `Admission = 0`, `Appointment = 0`,
   `DentalEncounter = 0`. Invosoft OP activity arrived as **invoices** (9,447, all
   `department = OP`), so OP history renders from billing. The IP tab is empty
   because there is no IP source data at all (see IP_OP_HISTORY_AUDIT.md).
3. **Prescriptions are almost absent.** Local `Prescription = 2` (both created by
   the lab test suite). There is no historical prescription table anywhere in the
   sources, so the Pharmacy tab's *prescribed* list is empty for historical
   patients by fact, not by bug.
4. **501 Xpertz accessions cannot be attached** to a patient (115 ambiguous, 386
   unmatched). They are not shown on any profile; their PDFs live in the
   Historical Unlinked Reports archive.

## 4. Query isolation and privacy

- Every query takes `patientId` from the authenticated route parameter and filters
  by it; no query accepts a client-supplied patient id list.
- Lab PDFs are served only through `/api/laboratory/reports/[id]/file` behind the
  session check — never as public files, never from `/public`.
- Responses for a single patient are not cached publicly.
