# Xpertz / LabSoft Database Audit

Read-only audit of the historical laboratory system. No source file was modified,
moved or deleted, and `Analysis .exe` / `SKYSOFT.exe` were never executed.

- Source archives: `new.zip`, `LabSoft.zip`, `copy1.zip` (extracted read-only to
  the gitignored `copyext/` folder).
- Reader: Python `access_parser` (`.mdb`), `xlrd`/`openpyxl` (spreadsheets).
- Raw evidence: `docs/xpertz-tables.json` (per-table columns and row counts),
  `docs/xpertz-union.json` (accession union), `logs/mdb-audit.log`.
- Audited on: 2026-11-27 / 2026-11-28.

## 1. The seven backup databases

`new/backup/mk1.mdb` … `mk7.mdb`. Every database contains **163 tables**; the
schema is identical across all seven.

| File | Size (bytes) | `Registration` | `heamatology` | `reg` | `patient` | `dailycollection` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| mk1.mdb | 57,970,688 | 1,047 | 13,474 | 1,083 | 254 | 1,047 |
| mk2.mdb | 58,068,992 | 1,048 | 13,487 | 1,084 | 254 | 1,048 |
| mk3.mdb | 53,809,152 | 1,008 | 12,991 | 1,043 | 253 | 1,008 |
| mk4.mdb | 54,530,048 | 1,015 | 13,077 | 1,050 | 253 | 1,015 |
| mk5.mdb | 55,152,640 | 1,021 | 13,143 | 1,057 | 254 | 1,021 |
| mk6.mdb | 55,808,000 | 1,027 | 13,236 | 1,063 | 254 | 1,027 |
| mk7.mdb | 55,873,536 | 1,028 | 13,246 | 1,064 | 254 | 1,028 |

**The backups are not a single progressive chain.** mk1 and mk2 hold *more* rows
than mk3…mk7, so the newer files are missing registrations that older files still
have (rows were deleted or the database was rebuilt between mk2 and mk3). The
count grows again monotonically from mk3 to mk7.

- Best single file: **mk2.mdb** (1,048 registrations, 13,487 result rows).
- Newest file: **mk7.mdb** (1,028 registrations, 13,246 result rows).
- **Union across all seven: 1,048 registrations, 1,021 accessions with results,
  13,487 result lines.** Nothing is gained by importing any one file besides mk2.

`LabSoft.zip` and `copy1.zip` both contain the same `MK.mdb`
(55,873,536 bytes, 2026-11-13) as `mk7.mdb` and add no rows. `copy1.zip`'s
`copyext/copy1/*.mdb` could not be deep-read (`access_parser` overflow-page
errors) but its size and contents match mk7.

## 2. Table roles and measured volume

| Table | Rows | Meaning | Migration value |
| --- | ---: | --- | --- |
| `Registration` | 1,028 | accession header: `id_no`, `ddate`, patient name/age/sex, doctor, total, bill status | **primary** — becomes `LabOrder` |
| `heamatology` | 13,246 | one row per result line, grouped by `(id_no, DepNum)` | **primary** — becomes `LabOrderResult` |
| `reg` | 1,064 | registration copy used by the front desk | duplicate of `Registration`, not imported |
| `dailycollection` | 1,028 | daily cash collection | cross-check only, not imported |
| `patient` | 254 | patient master with address/phone | **secondary** — name/age/sex corroboration |
| `review` | 24,145 | full-text report scratch table | no value |
| `code_check` | 2,045 | lab code list scratch | no value |
| `testheamatology` / `…small` / `…cap` | 682 / 596 / 498 | per-test report templates for haematology | reference for test names only |
| `testpackage` | 71 | test packages | reference |
| `testgroup` | 59 | department/test grouping | reference (`departments`) |
| `HISTOMICRO`, `HISTOIMPRESSION`, `antitable`, `cytomicro`, `PSMICRO`, `cytoimpression` | 72 / 69 / 47 / 45 / 45 / 44 | histopathology & microbiology dictionaries | no cases present |
| `GENERALCODE` | 101 | general test dictionary | reference |
| `repCodeforTest` | 63 | report code map | reference |
| `opbill`, `opbill_master`, `opbill_pay` | 6 / 2 / 2 | token OP billing | too small to matter |
| `doctor` | 3 | referring doctors | **secondary** — referral text |
| `staffreg` | 2 | staff | no value |
| `testrate` | 2 | price list | no value |
| `cytology` | 1 | one cytology case | see §3 |
| `InPatient_Details` | 0 | IP admissions | **empty** |
| `microbiology`, `histopathology` | 0 / 0 | culture and biopsy cases | **empty** |
| `pharmacies`, `purchase*`, `qtsales*`, `qtpurchaseret*`, `stock_adj` | 0 | pharmacy module | **empty** (see PHARMACY_HISTORY_MAPPING.md) |
| `stock`, `qtstock` | 2 / 4 | pharmacy stock stub | no transactions |

### Departments seen in result data

`BIOCHEMISTRY`, `HAEMATOLOGY`, `URINE ANALYSIS` / `URINEANALYSIS`, `GENERAL` /
`GENARAL`, `ELECTRO CARDIOGRAM`. The spelling variants are source data and are
normalised only in the importer, never rewritten in the report text.

## 3. What the data can and cannot support

Supported:
- 1,021 accessions with dated registrations, patients, doctors, departments, fees
  and full result lines including values, units and reference ranges.
- Result text is preserved verbatim (e.g. `178 mg/dl`, range `70 -140 mg/dl`), so
  no reference range or value is invented during migration.

Not supported:
- **No IP data.** `InPatient_Details` is empty in all seven files.
- **No pharmacy transactions.** Every purchase/sale/return table is empty.
- **No microbiology or histopathology cases** (dictionary tables only).
- One cytology case (`cytology` = 1 row) — too thin to migrate as a module; it is
  listed in MIGRATION_GAPS.md rather than imported.
- Registration fees exist, but there is no historical invoice/receipt identity to
  reconstruct against, so imported accessions carry the fee on the order
  (`costPaise`) and are **not** linked to a new invoice.

## 4. Currency note

Access stores money with 4 implied decimals. `amountPaise = total / 100`
(i.e. ₹ = `total / 10000`). This is applied verbatim in the importer; no amount is
recalculated or rounded from a different base.
