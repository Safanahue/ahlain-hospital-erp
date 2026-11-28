# Lab PDF Inventory

Inventory, validation and archive status of the historical laboratory report PDFs.

- Folders: `new/LAB REPORTS/` and `new/Email Report/`.
- Script: `scripts/audit-lab-pdfs.py`; manifest `docs/lab-pdf-manifest.json`.
- Checksum: SHA-256 per file; page count and extracted text sampled with `pypdf`.

## 1. Counts

| Metric | Value |
| --- | ---: |
| PDFs found | 535 |
| Valid (opens, ≥1 page) | 535 |
| Corrupt / unreadable | 0 |
| Empty (0 bytes or 0 pages) | 0 |
| Exact duplicate content (same SHA-256) | 0 |
| From `new/LAB REPORTS` | 476 |
| From `new/Email Report` | 59 |

The folders contain a few non-PDF entries (e.g. a file literally named ` .pdf`,
an Excel/Word artefact); those were skipped and are not part of the 535.

## 2. Content shape

Every sampled report is a one-page Ahlain Hospital letterhead:

```
Ahlain Hospital, TC 68/213(6), Kamal Eswaram, Manacaud P.O, Trivandrum-695049
Name / Age-Gender / Registration date / Reported date / Dept.No / SID No
Ref. By (doctor)          Test Description | Value | Observed | Reference Range
```

Extracted text is OCR-quality (`0/0` for `%`, `o/o` for `%`), so the PDFs are
**scans or print-to-PDF of the Xpertz report**, not digitally generated files.
Consequence: the PDF text is *not* used as the authoritative source for values —
the structured `heamatology` table is. The PDFs are the visual/legal record.

## 3. Archive and access

All 535 files are imported into PostgreSQL as `LabReportDocument` rows
(`bytes bytea`, SHA-256 unique), so they survive a Render redeploy without any
persistent disk:

| Field | Value |
| --- | --- |
| Imported rows | **535** |
| Total bytes | ≈ 300 MB (largest single file 625,163 B — `AADHI.pdf`) |
| Serving | `GET /api/laboratory/reports/[id]/file` — authenticated, `application/pdf` |
| Archive page | `/laboratory/reports` (search, pagination, download, ZIP export) |
| ZIP export | `GET /api/laboratory/reports/zip` — streamed, store-method ZIP built in `src/modules/shared/zip.ts` |

Re-running the importer is safe: `LabReportDocument.sha256` is `@unique`, so no
file is stored twice.

## 4. Matching to patients and orders

| Confidence | Rows | Meaning |
| --- | ---: | --- |
| `EXACT` | 33 | report number / registration number matched an imported accession |
| `PATIENT_NAME` | 59 | unique patient-name match; date corroborated |
| `UNMATCHED` | 443 | no reliable patient identity in the text |
| **Linked to a patient** | **92** | EXACT + PATIENT_NAME |
| **Linked to a lab order** | **0** | only 12 accessions are imported so far, none of them has a PDF |

443 PDFs remain unlinked because the OCR text often loses the `Dept.No` or the
patient name is too mangled (`SUHARA BEEVI (83,FEMALE)`) to match uniquely, and
because most PDFs belong to accessions that have not been imported yet. They are
**not** attached to a guessed patient: they appear in the separate
*Historical Unlinked Reports* archive instead, where staff can search by filename,
report number or date.

## 5. Verification performed

- 535/535 open successfully; page counts recorded in the manifest.
- Duplicate scan: 0 duplicate SHA-256 values across both folders.
- Runtime check (Playwright, admin session): `/laboratory/reports` renders
  "Showing 1–20 of 535"; a stored file returns HTTP 200,
  `Content-Type: application/pdf`, body starts `%PDF-` (625,163 bytes for the
  sampled archived file). No console errors.
