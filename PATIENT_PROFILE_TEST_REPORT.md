# Patient Profile Test Report

Evidence for the rebuilt patient profile (`/patients/[id]`) with its seven tabs.

Environment: local development, PostgreSQL 5433 (`ahlain_erp`), admin session.

## 1. What was checked

| Area | Check | Result |
| --- | --- | --- |
| Page load | `/patients/[id]` renders for a patient with imported lab history | pass |
| Tabs | all seven render without error: Overview, OP, IP, Laboratory, Pharmacy, Billing, Timeline | pass |
| Overview | UHID, name, gender, phone, address, blood group, allergies; counts per tab | pass |
| Age honesty | age printed only when stored on the patient; **no age is derived or invented** | pass |
| OP | OP invoices listed with date, items, amount, status | pass |
| IP | empty state explains that no admission records exist (source `InPatient_Details` = 0) | pass |
| Laboratory | imported `XP-GP-…` accession, historical date, every result line with value/unit/range | pass |
| Laboratory PDF | download link returns `application/pdf` | pass |
| Pharmacy | five labelled buckets (prescribed / dispensed / purchased / returned / cancelled), each stating its own source | pass (empty for history — no source data) |
| Billing | invoice total, paid, balance, status, payment ledger | pass |
| Timeline | chronological union with type filters; lab accession appears in date order | pass |
| Access control | page sits inside the authenticated dashboard layout; unauthenticated access redirects to login | pass |

## 2. Rendering evidence

- Patient lab tab shows the imported accession with its 2025-12 dates and results
  such as `178 mg/dl` (range `70 -140 mg/dl`), i.e. the value and range are the
  source's, not regenerated.
- Report page for the accession renders and its PDF route returns 200 with
  `application/pdf`.
- No React console errors or failed network requests were reported during the smoke
  pass.

## 3. Data integrity checks

```
select count(*) from "LabOrder";              -- 14   (12 imported + 2 in-app)
select count(*) from "LabReportDocument";     -- 535
select count(*) from "LabReportDocument" where "patientId" is not null;  -- 92
select count(*) from "Invoice";               -- 9,447 (all department = OP)
select count(*) from "Admission";             -- 0
```

- Billing reconciles: for imported invoices,
  `totalAmount = SUM(InvoiceItem.amount)` and `paidAmount = SUM(successful Payment)`.
- A tab's list length matches its Overview count (both come from
  `getPatientClinicalHistory`).
- No profile query accepts a client-supplied patient id; the id comes from the
  authenticated route.

## 4. Known display limitations

| Limitation | Cause | Visible effect |
| --- | --- | --- |
| `Other · 30 years` for some legacy patients | source master stores `MOHSINABDULLA  (35,MALE)` with age 30 / gender OTHER | pre-existing data damage; documented, not silently corrected |
| IP tab empty | `InPatient_Details` = 0 in all sources | honest empty state |
| Pharmacy tab empty for history | no prescription/dispense data in any source | honest empty state |
| 443 unlinked PDFs not on any profile | no reliable patient identity | available in the Historical Unlinked Reports archive |

## 5. Not tested

- No click-through of every button on every tab; the smoke pass covered the tabs,
  the lab result rendering and the PDF route.
- No mobile/tablet layout review.
- No automated end-to-end test was added for the profile page — the evidence above
  is a manual Playwright smoke pass plus the database queries.
