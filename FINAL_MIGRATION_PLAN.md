# Final Migration Plan

State of the migration, the exact steps to finish it, and the approvals still
required. **Nothing in production has been touched.**

## 1. Where things stand

| Item | Status |
| --- | --- |
| Source audit (7 Access DBs, 20 Analysis files, 535 PDFs) | complete |
| Schema additions (lab workflow, `LabOrderTest`, `LabReportDocument`, pharmacy partial dispense) | applied to **local dev DB only** |
| Lab backend, APIs, PDF/ZIP generation | complete, tested |
| Lab UI (dashboard, new order, report, reports archive) | complete, smoke-tested |
| Patient profile (7 tabs) | complete, smoke-tested |
| Historical accessions staged | 1,021 accessions / 13,487 result lines from **mk2** |
| Historical accessions imported | **12** (pilot), 125 result lines |
| Historical PDFs archived | **535 / 535** in PostgreSQL |
| PDFs linked to a patient | 92 (33 exact, 59 name match) |
| PDFs linked to an accession | 0 |
| Audit reports | 11 files at project root |
| Production migration | **not started** |
| Git commit / push / deploy | **not done** |

Production snapshot for comparison (2026-11-26): `patient` 2,690, `invoice` 9,445,
`invoiceItem` 58,210, `payment` 9,393, `labOrder` 4, `labOrderResult` 0,
`medicine` 4,234.

## 2. Phase plan

### Phase 0 — approvals (blocking)

- [ ] Approve a production database backup before any write.
- [ ] Approve the production schema push (additive fields and two new tables).
- [ ] Approve the lab import run and the PDF archive bulk load.
- [ ] Approve commit/push (Render auto-deploys `main`).

None of these can be skipped, and none can be done from this machine: the Render
`DATABASE_URL` is not available locally.

### Phase 1 — production backup

```bash
# on a machine with the production DATABASE_URL
node scripts/db-full-backup-and-verify.mjs
node scripts/prod-data-counts.mjs        # compare against target-counts.json
```

Record the counts before and after every phase. Abort if any count decreases
except where explicitly expected (none are expected).

### Phase 2 — schema

```bash
npx prisma db push        # additive: new nullable columns + 2 tables
npx prisma generate
```

Expected risk: near zero. Every added column is nullable or defaulted; the two new
tables are new; the only unique indexes are on new columns
(`LabOrder.sourceRef`, `LabOrder.invoiceId`, `LabReportDocument.sha256`).

### Phase 3 — laboratory history

```bash
node scripts/import-xpertz-labs.mjs --file docs/xpertz-staging/labs-mk2.jsonl            # dry run
node scripts/import-xpertz-labs.mjs --file docs/xpertz-staging/labs-mk2.jsonl --apply --confirm
```

Expected result: **508 new accessions**, ~902 `LabOrderTest`, ~7,003
`LabOrderResult`. Idempotent: `sourceRef` is canonical, so a re-run imports 0 and an
interrupted run resumes safely.

Verify:

```sql
select count(*) from "LabOrder" where "sourceRef" is not null;   -- >= 508
select "sourceRef", count(*) from "LabOrder" where "sourceRef" is not null
  group by 1 having count(*) > 1;                                -- 0 rows
select min("createdAt"), max("createdAt") from "LabOrder" where "sourceRef" is not null;
```

### Phase 4 — historical PDFs

```bash
node scripts/import-lab-pdfs.mjs            # dry run
node scripts/import-lab-pdfs.mjs --apply
```

Expected: 535 `LabReportDocument` rows (skip automatically if already present —
`sha256 @unique`). Storage ≈ 300 MB in PostgreSQL, sized for Render's managed
Postgres; no disk dependency.

### Phase 5 — verification

- Dashboard: search by patient/UHID/accession/date, confirm no default "today" filter.
- Open 5 random imported accessions: dates, values and ranges match the source row.
- Open 5 archived PDFs: HTTP 200, `application/pdf`, `%PDF-`.
- Patient profile: lab tab shows imported accessions; billing reconciles; timeline
  orders correctly.
- Run `npx vitest run` and `npm run build` against the release commit.

### Phase 6 — release

- [ ] Commit (excluding unrelated pre-existing modifications).
- [ ] Push to `main` (triggers Render deploy).
- [ ] Watch the deploy, then re-run Phase 5 checks on the live URL.

## 3. Rollback

| Phase | Rollback |
| --- | --- |
| Schema | additive only; reverting the code leaves unused nullable columns, which are harmless. A full restore is available from the Phase 1 backup. |
| Lab import | `delete from "LabOrderResult" ...` and `delete from "LabOrder" where "sourceRef" is not null;` (cascade removes tests/results). Never touches in-app orders. |
| PDF import | `delete from "LabReportDocument";` (or by `createdAt` range). |

All rollback statements are scoped to imported rows only — no in-application
record is ever deleted by them.

## 4. Work that cannot be done from these sources

- Inpatient history (`InPatient_Details` = 0).
- Pharmacy history (all transaction tables = 0).
- Prescription history (no table).
- Microbiology / histopathology (0 rows).
- 501 unmatched/ambiguous accessions (115 + 386) — need a human decision list.
- Analysis camp registers (2004–2008, other institutions) — deliberately excluded.

## 5. Definition of done

The migration is complete when: Phase 3 imports 508 accessions with 0 duplicates;
Phase 4 stores 535 PDFs; `labOrderResult` moves from 0 to ≈7,000 in production; the
full test suite shows no *new* failures versus the 7 pre-existing ones; the build is
clean; and the live site shows imported lab history on a patient profile with a
downloadable PDF.
