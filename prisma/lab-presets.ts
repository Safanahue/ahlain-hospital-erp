/**
 * Starter lab report presets (CBC / Haematology and LFT / Biochemistry).
 *
 * These intervals are common adult/paediatric reference values used as
 * editable DEFAULTS — they are not a clinical authority. Every range can be
 * changed in the UI (Laboratory → Report presets) to match the hospital's own
 * analyser and method.
 */

export type SeedRange = {
  gender: "Male" | "Female" | "Both";
  ageMinYears?: number | null;
  ageMaxYears?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  displayRange?: string | null;
  notes?: string | null;
};

export type SeedParameter = {
  section: string;
  name: string;
  unit: string;
  dataType?: "NUMERIC" | "TEXT";
  ranges: SeedRange[];
};

export type SeedTemplate = {
  name: string;
  category: string;
  description: string;
  parameters: SeedParameter[];
};

const CBC: SeedTemplate = {
  name: "CBC / Haematology",
  category: "Haematology",
  description:
    "Complete blood count with differential count and red cell indices. Ranges are editable defaults; verify against your analyser.",
  parameters: [
    {
      section: "Haematology",
      name: "Haemoglobin (Hb)",
      unit: "g/dL",
      ranges: [
        { gender: "Male", minValue: 13, maxValue: 17 },
        { gender: "Female", minValue: 12, maxValue: 15 },
      ],
    },
    {
      section: "Haematology",
      name: "Total WBC Count",
      unit: "/mcL",
      ranges: [{ gender: "Both", minValue: 4000, maxValue: 11000 }],
    },
    {
      section: "Haematology",
      name: "Total RBC Count",
      unit: "million/µL",
      ranges: [
        { gender: "Male", minValue: 4.5, maxValue: 5.9 },
        { gender: "Female", minValue: 4.1, maxValue: 5.1 },
      ],
    },
    {
      section: "Haematology",
      name: "PCV (Packed Cell Volume)",
      unit: "%",
      ranges: [
        { gender: "Male", minValue: 40, maxValue: 52 },
        { gender: "Female", minValue: 36, maxValue: 48 },
      ],
    },
    {
      section: "Haematology",
      name: "MCV",
      unit: "fL",
      ranges: [{ gender: "Both", minValue: 80, maxValue: 100 }],
    },
    {
      section: "Haematology",
      name: "MCH",
      unit: "pg",
      ranges: [{ gender: "Both", minValue: 27, maxValue: 33 }],
    },
    {
      section: "Haematology",
      name: "MCHC",
      unit: "g/dL",
      ranges: [{ gender: "Both", minValue: 32, maxValue: 36 }],
    },
    {
      section: "Haematology",
      name: "RDW-CV",
      unit: "%",
      ranges: [{ gender: "Both", minValue: 11.5, maxValue: 14.5 }],
    },
    {
      section: "Haematology",
      name: "Platelet Count",
      unit: "/mcL",
      ranges: [{ gender: "Both", minValue: 150000, maxValue: 450000 }],
    },
    {
      section: "Haematology",
      name: "ESR (Westergren)",
      unit: "mm/hr",
      ranges: [
        { gender: "Male", minValue: 0, maxValue: 15 },
        { gender: "Female", minValue: 0, maxValue: 20 },
      ],
    },
    {
      section: "Differential Count",
      name: "Neutrophils",
      unit: "%",
      ranges: [{ gender: "Both", minValue: 40, maxValue: 75 }],
    },
    {
      section: "Differential Count",
      name: "Lymphocytes",
      unit: "%",
      ranges: [{ gender: "Both", minValue: 20, maxValue: 45 }],
    },
    {
      section: "Differential Count",
      name: "Eosinophils",
      unit: "%",
      ranges: [{ gender: "Both", minValue: 1, maxValue: 6 }],
    },
  ],
};

const LFT: SeedTemplate = {
  name: "Liver Function Test (LFT)",
  category: "Biochemistry",
  description:
    "Liver function panel with bilirubin fractions, transaminases, alkaline phosphatase and protein fractions. Ranges are editable defaults.",
  parameters: [
    {
      section: "Bilirubin",
      name: "Total Bilirubin",
      unit: "mg/dL",
      ranges: [{ gender: "Both", minValue: 0.3, maxValue: 1.2 }],
    },
    {
      section: "Bilirubin",
      name: "Direct Bilirubin",
      unit: "mg/dL",
      ranges: [{ gender: "Both", minValue: 0, maxValue: 0.3 }],
    },
    {
      section: "Bilirubin",
      name: "Indirect Bilirubin",
      unit: "mg/dL",
      ranges: [{ gender: "Both", minValue: 0.2, maxValue: 0.9 }],
    },
    {
      section: "Liver Enzymes",
      name: "SGOT (AST)",
      unit: "U/L",
      ranges: [
        { gender: "Male", minValue: 10, maxValue: 40 },
        { gender: "Female", minValue: 10, maxValue: 32 },
      ],
    },
    {
      section: "Liver Enzymes",
      name: "SGPT (ALT)",
      unit: "U/L",
      ranges: [
        { gender: "Male", minValue: 7, maxValue: 56 },
        { gender: "Female", minValue: 7, maxValue: 45 },
      ],
    },
    {
      section: "Liver Enzymes",
      name: "Alkaline Phosphatase",
      unit: "U/L",
      ranges: [
        { gender: "Male", minValue: 40, maxValue: 129, ageMinYears: 13, notes: "Adult" },
        { gender: "Female", minValue: 35, maxValue: 104, ageMinYears: 13, notes: "Adult" },
        { gender: "Both", minValue: 100, maxValue: 400, ageMinYears: 1, ageMaxYears: 12, notes: "Child" },
      ],
    },
    {
      section: "Proteins",
      name: "Total Protein",
      unit: "g/dL",
      ranges: [{ gender: "Both", minValue: 6, maxValue: 8.3 }],
    },
    {
      section: "Proteins",
      name: "Albumin",
      unit: "g/dL",
      ranges: [{ gender: "Both", minValue: 3.5, maxValue: 5.2 }],
    },
    {
      section: "Proteins",
      name: "Globulin",
      unit: "g/dL",
      ranges: [{ gender: "Both", minValue: 2, maxValue: 3.5 }],
    },
    {
      section: "Proteins",
      name: "A/G Ratio",
      unit: "ratio",
      ranges: [{ gender: "Both", minValue: 1, maxValue: 2.1 }],
    },
  ],
};

export const LAB_REPORT_PRESETS: SeedTemplate[] = [CBC, LFT];

/** Starter bed layout for a new IP module. Tariffs are editable defaults. */
export const STARTER_BEDS = [
  { bedNumber: "GW-101", ward: "General Ward", roomNo: "101", floor: "1st floor", dailyRateRupees: 1500 },
  { bedNumber: "GW-102", ward: "General Ward", roomNo: "101", floor: "1st floor", dailyRateRupees: 1500 },
  { bedNumber: "GW-103", ward: "General Ward", roomNo: "102", floor: "1st floor", dailyRateRupees: 1500 },
  { bedNumber: "GW-104", ward: "General Ward", roomNo: "102", floor: "1st floor", dailyRateRupees: 1500 },
  { bedNumber: "SP-201", ward: "Semi-Private", roomNo: "201", floor: "2nd floor", dailyRateRupees: 3000 },
  { bedNumber: "SP-202", ward: "Semi-Private", roomNo: "202", floor: "2nd floor", dailyRateRupees: 3000 },
  { bedNumber: "PVT-301", ward: "Deluxe Private", roomNo: "301", floor: "3rd floor", dailyRateRupees: 5000 },
  { bedNumber: "PVT-302", ward: "Deluxe Private", roomNo: "302", floor: "3rd floor", dailyRateRupees: 5000 },
  { bedNumber: "ICU-01", ward: "ICU", roomNo: "ICU-A", floor: "1st floor", dailyRateRupees: 8000 },
  { bedNumber: "ICU-02", ward: "ICU", roomNo: "ICU-A", floor: "1st floor", dailyRateRupees: 8000 },
  { bedNumber: "ISO-401", ward: "Isolation", roomNo: "401", floor: "4th floor", dailyRateRupees: 3500 },
];
