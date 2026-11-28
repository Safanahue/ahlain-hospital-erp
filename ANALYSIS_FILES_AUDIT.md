# Analysis Folder Audit (`new/Analysis/`)

Read-only inspection of the Xpertz "Analysis" folder: 7 spreadsheets and 13 Word
documents plus one zero-byte executable and one Office lock file (25 entries).

- Reader: `xlrd` (legacy `.xls`). The `.doc` files are pre-2007 binary Word and no
  safe text extractor (`antiword`, `textract`) is available on this machine, so
  they were inventoried by name/size/date only — **their contents are not
  quoted anywhere in these reports.**
- `Analysis .exe` is 0 bytes and was **never executed**. No file was modified.
- Script: `scripts/audit-analysis.py`.

## 1. Spreadsheets

All `.xls` files are single-sheet exports with two empty trailing sheets.

| File | Size | Sheet1 (rows × cols) | Header / institution | Contents |
| --- | ---: | --- | --- | --- |
| `REG1.XLS` | 26 KB | 187 × 11 | `.MAY-08` / `.AUG-08` columns | monthly collection totals per date (two month blocks), amounts only |
| `REG2.XLS` | 690 KB | 7,163 × 38 | **B.M.HOSPITAL**, `.OCTOBER-04` | `Date, ID, Name, Age/Sex, Test, Rate` register lines from Oct 2004 |
| `REG3.XLS` | 32 KB | 180 × 6 | **DOCTORS SCAN CENTRE** | `DATE, IDNO, NAME, AGE/SEX, TEST, RATE` |
| `REG4.XLS` | 18 KB | 60 × 7 | **CANARA BANK** | camp list: date, sl, name, age/sex, amount |
| `REG5.XLS` | 150 KB | 1,219 × 8 | **LIC**, `.AUGUST-05` | camp register: date, name, age/sex, test, rate |
| `REG6.XLS` | 120 KB | 1,091 × 8 | **ITDP** | `Date, Name, age/sex, IP/OP No, Bill No, Amount` |
| `Book1.xls` | 14 KB | 25 × 1 | — | plain antibiotic name list (Nitrofurantoin, Ampicillin, …) |

Dates are Excel serial numbers (e.g. 38261 = 2004-10-01), i.e. **2004–2008**.

## 2. Word documents (inventoried, not parsed)

| File | Size | Likely content |
| --- | ---: | --- |
| `9DB67100` (no extension) | 244 KB | binary Office document, unrecognised header |
| `ACBI.doc` | 163 KB | biochemistry analyser notes |
| `BIOCHEMISTRY_1/2/3.doc` | 19/63/19 KB | biochemistry SOP / parameter lists |
| `BLOOD_BANK.doc` | 19 KB | blood bank SOP |
| `CYTOLOGY.DOC` | 19 KB | cytology SOP |
| `HAEMATOLOGY_2.doc`, `haematology_3.doc` | 54/132 KB | haematology SOP / parameter lists |
| `HELP.DOC` | 19 KB | product help text |
| `HISTOPATHOLOGY.doc` | 19 KB | histopathology SOP |
| `MICROBIOLOGY.doc` | 19 KB | microbiology SOP |
| `NABL.doc` | 2.1 MB | NABL accreditation material |
| `PARASITOLOGY.doc` | 19 KB | parasitology SOP |
| `SEROLOGY.DOC` | 43 KB | serology SOP |
| `SAMPLE COLLECTION.doc` | 19 KB | sample collection instructions |
| `URINE_ANALYSIS.doc` | 19 KB | urine analysis SOP |
| `instumentation.doc` | 24 KB | instrument list |
| `~$EMATOLOGY_2.doc` | 162 B | Word lock file, not a document |

These are **procedure/library material from the vendor**, not patient records.
Even if they were parsed they could not contribute patient history, so their
inaccessibility is not a migration gap for clinical data.

## 3. Verdict

The Analysis folder is **third-party camp/reference material**, not Ahlain patient
history:

- The registers belong to **B.M. Hospital (2004), Doctors Scan Centre, Canara Bank
  and LIC camps (2005), ITDP** — different institutions, not Ahlain Hospital.
- They carry only `date, name, age/sex, test, rate`. **No report, no result value,
  no reference range, no accession number** that can be tied to a Xpertz result
  line or to an Ahlain patient.
- `REG6` has `IP/OP No` and `Bill No`, but those numbers belong to the source
  institution's numbering, and the patient identities cannot be verified against
  Ahlain's UHID space.

**Decision: none of the Analysis spreadsheets or documents is imported.** Importing
a 2004 B.M. Hospital line as an Ahlain lab visit would fabricate a clinical record.
They are retained as reference and would be useful only as an optional
"third-party camp register" archive, which nobody has asked for.
