import { z } from "zod";

const labTestInputSchema = z.object({
  testName: z.string().trim().min(1, "Test name is required"),
  testCode: z.string().trim().optional(),
  department: z.string().trim().optional(),
  sampleType: z.string().trim().optional(),
  priceRupees: z.coerce.number().min(0).default(0),
  templateId: z.string().nullable().optional(),
});

export const createLabOrderSchema = z.object({
  patientId: z.string().min(1, "Select a patient"),
  orderedById: z.string().min(1, "Select ordering doctor"),
  testName: z.string().trim().optional(),
  sampleType: z.string().trim().optional(),
  costRupees: z.coerce.number().int().min(0).default(0),
  // Multi-test registration: one accession, one collection, many investigations.
  tests: z.array(labTestInputSchema).max(40).optional(),
  department: z.string().trim().optional(),
  priority: z.enum(["ROUTINE", "URGENT", "STAT"]).default("ROUTINE"),
  sampleId: z.string().trim().optional(),
  raiseInvoice: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional(),
}).refine(
  (data) => Boolean(data.testName?.trim()) || Boolean(data.tests?.length),
  { message: "Select at least one test", path: ["tests"] },
);

export const labOrderListQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.string().trim().optional(),
  department: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

export type LabOrderListQuery = z.infer<typeof labOrderListQuerySchema>;

// Input type keeps schema defaults optional for callers (API/page/tests).
export type CreateLabOrderInput = z.input<typeof createLabOrderSchema>;

export const updateLabOrderSchema = z.object({
  status: z.enum(["ORDERED", "SAMPLE_COLLECTED", "RESULT_ENTERED", "VERIFIED", "CANCELLED"]),
  sampleType: z.string().trim().optional(),
  sampleId: z.string().trim().optional(),
  resultValue: z.string().trim().optional(),
  referenceRange: z.string().trim().optional(),
  findings: z.string().trim().optional(),
  rejectionReason: z.string().trim().max(300).optional(),
});

export const rejectSampleSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason for rejecting the sample").max(300),
});

export type UpdateLabOrderInput = z.infer<typeof updateLabOrderSchema>;

export const createRefRangeSchema = z
  .object({
    serviceId: z.string().optional().nullable(),
    testName: z.string().trim().min(1, "Test name is required"),
    parameterName: z.string().trim().min(1, "Parameter name is required"),
    gender: z.enum(["Male", "Female", "Both"]).default("Both"),
    ageGroup: z.string().trim().min(1, "Age group is required").default("Adult"),
    minValue: z.coerce.number().optional().nullable(),
    maxValue: z.coerce.number().optional().nullable(),
    unit: z.string().trim().min(1, "Unit is required"),
    displayRange: z.string().trim().optional().nullable(),
    notes: z.string().trim().optional().nullable(),
    category: z.string().trim().max(60).optional().nullable(),
    sortOrder: z.coerce.number().int().min(0).max(999).optional(),
    // Registers a new LAB service so a custom test can be ordered from the lab.
    createService: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.minValue != null && data.maxValue != null) {
        return data.minValue <= data.maxValue;
      }
      return true;
    },
    {
      message: "Minimum value cannot be greater than maximum value",
      path: ["minValue"],
    },
  );

export type CreateRefRangeInput = z.infer<typeof createRefRangeSchema>;

export const updateRefRangeSchema = z
  .object({
    parameterName: z.string().trim().min(1, "Parameter name is required").optional(),
    gender: z.enum(["Male", "Female", "Both"]).optional(),
    ageGroup: z.string().trim().min(1, "Age group is required").optional(),
    minValue: z.coerce.number().optional().nullable(),
    maxValue: z.coerce.number().optional().nullable(),
    unit: z.string().trim().min(1, "Unit is required").optional(),
    displayRange: z.string().trim().optional().nullable(),
    notes: z.string().trim().optional().nullable(),
    category: z.string().trim().max(60).optional().nullable(),
    sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  })
  .refine(
    (data) => {
      if (data.minValue != null && data.maxValue != null) {
        return data.minValue <= data.maxValue;
      }
      return true;
    },
    {
      message: "Minimum value cannot be greater than maximum value",
      path: ["minValue"],
    },
  );

export type UpdateRefRangeInput = z.infer<typeof updateRefRangeSchema>;

export const refRangeQuerySchema = z.object({
  testName: z.string().optional(),
  serviceId: z.string().optional(),
  category: z.string().optional(),
  q: z.string().optional(),
});

export type RefRangeQuery = z.infer<typeof refRangeQuerySchema>;

// ---------------------------------------------------------------------------
// Wave 3 — report presets & structured results
// ---------------------------------------------------------------------------

const optionalInt = z.coerce.number().int().min(0).max(150).nullable().optional();
const optionalFloat = z.coerce.number().nullable().optional();

export const templateRangeSchema = z
  .object({
    gender: z.enum(["Male", "Female", "Both"]).default("Both"),
    ageMinYears: optionalInt,
    ageMaxYears: optionalInt,
    minValue: optionalFloat,
    maxValue: optionalFloat,
    displayRange: z.string().trim().nullable().optional(),
    notes: z.string().trim().nullable().optional(),
  })
  .refine(
    (range) =>
      range.minValue == null || range.maxValue == null || range.minValue <= range.maxValue,
    { message: "Minimum cannot be greater than maximum", path: ["minValue"] },
  )
  .refine(
    (range) =>
      range.ageMinYears == null ||
      range.ageMaxYears == null ||
      range.ageMinYears <= range.ageMaxYears,
    { message: "Age lower bound cannot be greater than the upper bound", path: ["ageMinYears"] },
  );

export const templateParameterSchema = z.object({
  section: z.string().trim().optional().default(""),
  name: z.string().trim().min(1, "Parameter name is required"),
  unit: z.string().trim().optional().default(""),
  dataType: z.enum(["NUMERIC", "TEXT"]).optional().default("NUMERIC"),
  sortOrder: z.coerce.number().int().min(0).optional(),
  ranges: z.array(templateRangeSchema).min(1, "Add at least one reference range"),
});

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1, "Preset name is required").max(120),
  category: z.string().trim().max(60).optional().default("Haematology"),
  description: z.string().trim().max(500).optional(),
  active: z.boolean().optional().default(true),
  parameters: z.array(templateParameterSchema).min(1, "Add at least one test parameter"),
});

// Input types keep defaults optional so callers don't have to restate them.
export type CreateTemplateInput = z.input<typeof createTemplateSchema>;

export const updateTemplateSchema = z.object({
  name: z.string().trim().min(1, "Preset name is required").max(120).optional(),
  category: z.string().trim().max(60).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().optional(),
  parameters: z.array(templateParameterSchema).min(1, "Add at least one test parameter").optional(),
});

export type UpdateTemplateInput = z.input<typeof updateTemplateSchema>;

export const duplicateTemplateSchema = z
  .object({ name: z.string().trim().min(1).max(120).optional() })
  .optional()
  .default({});

export type DuplicateTemplateInput = z.infer<typeof duplicateTemplateSchema>;

export const templateListQuerySchema = z.object({
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
  includeInactive: z.enum(["true", "false"]).optional(),
});

export const saveResultsSchema = z.object({
  templateId: z.string().nullable().optional(),
  findings: z.string().trim().max(2000).optional(),
  results: z
    .array(
      z.object({
        parameterId: z.string().nullable().optional(),
        section: z.string().trim().nullable().optional(),
        parameterName: z.string().trim().min(1, "Parameter name is required"),
        resultValue: z.string().trim().min(1, "Enter a value for every parameter"),
        unit: z.string().trim().optional().default(""),
        referenceRange: z.string().trim().nullable().optional(),
        flag: z.enum(["LOW", "HIGH", "NORMAL", "NONE"]).optional(),
        sortOrder: z.coerce.number().int().min(0).optional(),
      }),
    )
    .min(1, "Enter at least one result"),
});

export type SaveResultsInput = z.infer<typeof saveResultsSchema>;
