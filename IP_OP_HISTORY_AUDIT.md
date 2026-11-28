# IP / OP History Audit

Whether historical inpatient and outpatient history exists in the sources, and what
the patient profile can honestly show.

## 1. What the sources contain

### Xpertz (7 Access databases)

| Table | Rows | Verdict |
| --- | ---: | --- |
| `InPatient_Details` | **0** | no IP admissions, no ward/bed, no discharge |
| `opbill_master` | 2 | token OP billing header |
| `opbill` | 6 | six OP bill lines |
| `opbill_pay` | 2 | two OP payments |
| `Registration` | 1,028 | **laboratory** registrations, not OP visits |
| `dailycollection` | 1,028 | daily cash totals for those lab registrations |
| `reg_out` | 13 | thirteen "other" registrations |
| `PendingBill` | 0 | — |

Xpertz is a **laboratory system**. It has no admission records and its OP billing
is a six-line stub. Nothing here can produce an OP visit history or an IP stay.

### Analysis spreadsheets (2004–2008)

`REG6.XLS` (1,091 rows) does carry `IP/OP No` and `Bill No`, but it belongs to
**ITDP**, a different institution, in 2004–2008, with no Ahlain patient identity.
`REG2.XLS` (7,163 rows, B.M. Hospital, Oct 2004) and `REG5.XLS` (LIC camp, Aug
2005) are camp registers. None of these is Ahlain OP/IP history. See
ANALYSIS_FILES_AUDIT.md.

### Invosoft HMIS export (already imported)

The bulk of the live system came from Invosoft. In that import, outpatient
activity arrived as **invoices**, not as visit rows:

| Table (local) | Rows |
| --- | ---: |
| `Invoice` (`department = OP`) | 9,447 |
| `InvoiceItem` | 58,215 |
| `Payment` | 9,395 |
| `OPVisit` | **0** |
| `Admission` | **0** |
| `Appointment` | **0** |
| `DentalEncounter` | **0** |
| `Refund` | 0 |

## 2. Consequence for the patient profile

- **OP tab**: renders from OP invoices (date, department, items, amount, status)
  and OP payments. This is real, auditable data — it is the *billing* view of the
  visit, not a clinical note, because no clinical OP notes exist in the source.
- **IP tab**: empty for every historical patient, because `InPatient_Details` is 0
  and Invosoft admissions were not part of this import. The tab states that no
  admission records exist rather than implying "no admissions happened".
- **Overview counts** therefore show OP invoices and no admissions; they do not
  count anything that is not in the database.

## 3. What would be required for real IP/OP history

An IP stay needs: admission date/time, ward and bed, admitting doctor, diagnosis,
daily charges, discharge date and summary. None of those columns exists in any
source that is available here (`InPatient_Details` is an empty table in all seven
databases). To populate IP history one of these must happen:

1. The hospital supplies an Invosoft/Xpertz IP export that actually contains
   admission rows, or
2. IP history is entered going forward in Ahlain (the module already exists:
   `/ip`, `/ip/beds`, `/ip/[id]/discharge`, `/ip/[id]/summary`).

Until then, **no IP record may be fabricated** — and none has been.

## 4. Verification

- `select count(*) from "Admission";` → 0
- `select count(*) from "OPVisit";` → 0
- `select count(*) from "Invoice" where department = 'OP';` → 9,447
- Xpertz `InPatient_Details` → 0 rows in mk1…mk7 (audited in `docs/xpertz-tables.json`).
