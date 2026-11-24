import "server-only";

export interface SmsTemplateConfig {
  code: string;
  name: string;
  body: string;
  dltTemplateId?: string;
  description: string;
  variables: string[];
}

export const DEFAULT_TEMPLATES: Record<string, SmsTemplateConfig> = {
  PATIENT_REGISTRATION: {
    code: "PATIENT_REGISTRATION",
    name: "Patient Registration Confirmation",
    body: "Welcome to {hospitalName}, {patientName}. Your UHID is {uhid}. For appointments, call our front desk. Thank you.",
    dltTemplateId: "1107161234567890123",
    description: "Sent automatically to patient's registered mobile number after new patient registration.",
    variables: ["{hospitalName}", "{patientName}", "{uhid}"],
  },
  PAYMENT_RECEIPT: {
    code: "PAYMENT_RECEIPT",
    name: "Successful Payment Confirmation",
    body: "{hospitalName}: Received Rs. {amount} via {method} for Receipt #{receiptNo} (Invoice #{invoiceNo}). Thank you.",
    dltTemplateId: "1107161234567890124",
    description: "Sent automatically after payment success across OP, IP, Lab, Pharmacy, and Dental.",
    variables: ["{hospitalName}", "{amount}", "{method}", "{receiptNo}", "{invoiceNo}"],
  },
};

// In-memory runtime override store (can be updated by Admin without DB schema changes)
let runtimeTemplates: Record<string, SmsTemplateConfig> = { ...DEFAULT_TEMPLATES };

export function getSmsTemplates(): Record<string, SmsTemplateConfig> {
  return { ...runtimeTemplates };
}

export function updateSmsTemplate(code: string, newBody: string, dltTemplateId?: string): boolean {
  if (!runtimeTemplates[code]) return false;
  runtimeTemplates[code] = {
    ...runtimeTemplates[code],
    body: newBody.trim(),
    dltTemplateId: dltTemplateId?.trim() || runtimeTemplates[code].dltTemplateId,
  };
  return true;
}

export function renderSmsBody(
  code: string,
  params: Record<string, string | number>,
): { body: string; dltTemplateId?: string } {
  const template = runtimeTemplates[code] || DEFAULT_TEMPLATES[code];
  if (!template) {
    return { body: "" };
  }

  let text = template.body;
  for (const [key, val] of Object.entries(params)) {
    text = text.replaceAll(`{${key}}`, String(val));
  }

  return {
    body: text.replace(/\s+/g, " ").trim(),
    dltTemplateId: template.dltTemplateId,
  };
}
