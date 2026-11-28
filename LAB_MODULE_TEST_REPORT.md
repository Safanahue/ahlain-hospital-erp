# Lab Module Test Report

Evidence for the rebuilt laboratory module: automated tests, typecheck, production
build, full-suite comparison and a browser smoke check.

Environment: local development (`http://127.0.0.1:3000`), PostgreSQL 5433
(`ahlain_erp`), admin `admin@ahlain.in`.

## 1. Automated tests — targeted

| Suite | Result |
| --- | --- |
| `tests/wave14/lab-module.test.ts` | **6 / 6 pass** |
| `tests/wave3/lab-presets.test.ts` | **8 / 8 pass** |

`tests/wave14/lab-module.test.ts` (new this wave) covers:

1. registering an accession with **multiple tests** creates one `LabOrder`, one
   `LabOrderTest` per test, and **exactly one** LAB invoice in the same transaction;
2. the same accession cannot raise a second invoice (`LabOrder.invoiceId @unique`);
3. `listLabOrders` returns full history and is **not** filtered to today by default;
4. search by patient / UHID / accession / date range;
5. sample collection and sample rejection transitions;
6. result entry → verification, including the audit trail entry.

`tests/wave3/lab-presets.test.ts` (8 presets tests) still passes after the schema
additions; its teardown was updated to delete the LAB invoice created for the test
accession, so the suite leaves no residue.

## 2. Typecheck and build

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | **clean, 0 errors** |
| Production build | `npm run build` | **exit 0** |

Build output includes the new routes:

```
ƒ /laboratory                        11.8 kB   142 kB
ƒ /laboratory/[id]/report             1.15 kB  108 kB
ƒ /laboratory/reports                 784 B    119 kB
ƒ /patients/[id]                      785 B    119 kB
```

(The dev server was stopped before `next build`, because `next build` clears
`.next` and would break a running dev server.)

## 3. Full suite (regression comparison)

`npx vitest run` — **197 passed, 7 failed, 2 skipped (206 tests, 23 files)**.

Failures, all pre-existing and unrelated to the lab or patient-history work:

| File | Tests |
| --- | --- |
| `tests/wave0/seed.test.ts` | development seed |
| `tests/wave2/appointments.test.ts` | file-level failure |
| `tests/sms-phase2.test.ts` | "defaults to safe MockLogProvider when no live gateway credentials are set" |
| `tests/wave5/permissions.test.ts` | "matches the agreed module matrix"; "stores only deviations from the role defaults and audits the change" |
| `tests/wave7/sms.test.ts` | "logs a SKIPPED row without calling the gateway when keys are absent"; "sends through Twilio and stores the provider message id"; "records a FAILED row with the gateway message on rejection"; "only lets payment-capable roles send SMS" |

These are reported **as failures, not skipped or suppressed**. The SMS/permission
failures come from an existing permission-matrix and gateway-mock mismatch; the
seed test expects a seed routine the project deliberately stopped running (the seed
deletes rows). None of them exercises laboratory or patient-history code paths —
the 14 lab tests above all pass.

## 4. Browser smoke check

Playwright, authenticated as admin:

| Check | Result |
| --- | --- |
| `/laboratory` renders | title correct; list shows `Showing 1–14 of 14` |
| Imported accessions visible | `XP-GP-…` rows present with historical dates and invoice column |
| Status/date filters + search | do not default to "today"; full history returned |
| `/laboratory/reports` | `Showing 1–20 of 535` archived PDFs |
| Patient lab tab | accession and every result line render |
| New report PDF | `GET /api/laboratory/orders/[id]/pdf` → 200, `application/pdf`, 2,470 bytes, body starts `%PDF-` |
| Archived PDF | `GET /api/laboratory/reports/[id]/file` → 200, `application/pdf`, 625,163 bytes |
| Console | no errors |

## 5. Data verification after import

| Query | Result |
| --- | --- |
| accessions with `sourceRef` | 12 |
| duplicate `sourceRef` | 0 |
| imported result lines | 125 |
| imported test rows | 20 |
| historical date preserved | `createdAt = 2025-12-31` for `XP-GP-1575-25` |
| dedupe on re-run (mk2 dry run) | `alreadyImported: 12`, no duplicates |

## 6. Not tested

- No test was run against production; production has not been migrated.
- The full 508-accession apply was not run — only the 12-accession pilot.
- PDF generation was not opened in a desktop PDF reader; it was verified by HTTP
  status, content type and the `%PDF-` magic bytes.
