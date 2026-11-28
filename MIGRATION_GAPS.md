# Migration Gaps

Everything that could not be migrated, why, and what it would take to close it.
Each item is either a **source limitation** (the data does not exist) or a
**decision** (the data exists but importing it would fabricate or duplicate
records).

## 1. Hard blockers (no data exists)

| # | Gap | Evidence | Effect |
| --- | --- | --- | --- |
| 1 | **No inpatient history** | `InPatient_Details` = 0 rows in mk1…mk7; `Admission` = 0 locally | IP tab is empty for every historical patient |
| 2 | **No pharmacy transactions** | every purchase/sale/return table = 0; `stock` = 2, `qtstock` = 4 stub rows | all five pharmacy buckets empty for historical patients |
| 3 | **No historical prescriptions** | no prescription table in any source; `Prescription` = 2 (test rows) | prescribed list empty for history |
| 4 | **No OP clinical notes** | Invosoft delivered OP activity as invoices only; `OPVisit` = 0 | OP tab is a billing view, not a clinical one |
| 5 | **No microbiology / histopathology cases** | `microbiology` = 0, `histopathology` = 0 (dictionary tables only) | culture and biopsy modules have no history |
| 6 | **One cytology case** | `cytology` = 1 row | too thin to migrate; kept as a documented orphan |
| 7 | **Word `.doc` files unreadable** | no `antiword`/`textract` on this machine | Analysis SOPs not parsed — they are vendor procedure text, not patient data, so no clinical loss |

## 2. Deliberate exclusions (data exists, importing would be wrong)

| # | Gap | Count | Reason |
| --- | ---: | --- | --- |
| 8 | Xpertz accessions with **ambiguous** patient match | **115** | 2+ Ahlain patients share the normalised name; picking one would invent a link |
| 9 | Xpertz accessions with **no patient match** | **386** | patient absent, or name/age/sex conflict with the only candidate |
| 10 | PDFs with **no reliable identity** | **443** of 535 | kept in the Historical Unlinked Reports archive, searchable, never guessed onto a patient |
| 11 | Analysis camp registers (2004–2008) | 9,911 rows across REG1–REG6 + Book1 | different institutions (B.M. Hospital, Doctors Scan Centre, Canara Bank, LIC, ITDP); no report, no result, no Ahlain identity |
| 12 | 11 hand-created local test patients | 11 | synthetic smoke-test data, already excluded from the production import |
| 13 | Historical lab invoices | 1,021 accessions | Xpertz has fees but no invoice/receipt identity; a synthetic invoice number would be invented |

## 3. Structural gaps in what *was* migrated

| # | Gap | Detail |
| --- | --- | --- |
| 14 | Migrated accessions have **no invoice link** | `LabOrder.invoiceId = NULL` for the 12 imported rows: the fee is preserved on `costPaise`, but no `Invoice` row is fabricated |
| 15 | Migrated accessions have **no PDF link** | `LabReportDocument.orderId` = 0 rows; the 12 imported accessions have no archived PDF, and the 92 patient-linked PDFs belong to accessions not yet imported |
| 16 | **Duplicate document text is not deduplicated at page level** | `sha256` catches identical files (0 found); two different scans of the same report would both be stored |
| 17 | **Mangled legacy patient master** | names like `MOHSINABDULLA  (35,MALE)` with `age = 30`, `gender = OTHER`; the lab importer parses this pattern for matching but the master is not rewritten |
| 18 | **Only 12 of 508 matched accessions applied** | deliberate pilot; the remaining 496 are staged and ready |
| 19 | **Production not migrated** | no `DATABASE_URL` for Render is available on this machine; production counts are unchanged (`labOrder` 4, `labOrderResult` 0) |

## 4. Findings corrected during this wave

- **mk2, not mk7, is the superset.** mk1/mk2 hold more registrations than
  mk3…mk7 (1,048 vs 1,028), so "newest file" is not "most complete". Staging was
  re-exported from mk2: 1,021 accessions / 13,487 result lines (mk7: 1,001 /
  13,246).
- **Dedupe key was file-scoped.** `sourceRef` used to start with the database
  filename (`mk7.mdb:…`), so importing a second backup would have duplicated every
  accession. It is now canonical (`xpertz:<id_no>|<DepNum>`), and the 12 existing
  local rows were rewritten to the canonical form. Re-running the importer on mk2
  now reports `alreadyImported: 12` instead of duplicating them.
- **`LabSoft.zip` and `copy1.zip` add nothing.** Both carry the same `MK.mdb` as
  `mk7.mdb` (55,873,536 bytes). `copy1.zip`'s nested `.mdb` could not be deep-read
  (`access_parser` overflow-page errors), but its size and contents match mk7.

## 5. To close the open gaps

1. **Full lab import**: run `node scripts/import-xpertz-labs.mjs --file
   docs/xpertz-staging/labs-mk2.jsonl --apply --confirm` against the target
   database (508 accessions → 902 tests, 7,003 results). Requires approval.
2. **Resolve 115 ambiguous accessions**: needs a human decision list (accession,
   candidate UHIDs, name, age, sex) — not automatable without inventing a link.
3. **Link the 92 patient-matched PDFs** to their accessions once those accessions
   are imported, then re-run `scripts/import-lab-pdfs.mjs` to fill `orderId`.
4. **IP/pharmacy/prescription history**: requires new exports from the systems that
   actually held them; nothing in the current archives can supply it.
