import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type LabPdfOrder = {
  orderNo: string;
  reportNo?: string | null;
  testName: string;
  sampleType?: string | null;
  department?: string | null;
  priority?: string | null;
  sampleCollectedAt?: Date | null;
  verifiedAt?: Date | null;
  createdAt: Date;
  findings?: string | null;
  patient: { name: string; uhid: string; age: number; gender: string; phone: string };
  orderedBy?: { name: string } | null;
  verifiedBy?: { name: string } | null;
  tests?: { testName: string; department?: string | null; pricePaise: number }[];
  results: {
    parameterName: string;
    resultValue: string;
    unit?: string | null;
    referenceRange?: string | null;
    flag?: string | null;
    section?: string | null;
  }[];
};

export type LabPdfSettings = {
  hospitalName: string;
  addressLine1?: string | null;
  phone?: string | null;
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const PAGE_BOTTOM = 60;

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Renders an A4 laboratory report. Results are the stored snapshot rows, so the
 * PDF matches exactly what was verified in the system.
 */
export async function buildLabReportPdf(
  order: LabPdfOrder,
  settings: LabPdfSettings,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.09, 0.16, 0.29);
  const muted = rgb(0.42, 0.45, 0.5);
  const line = rgb(0.85, 0.87, 0.9);
  const danger = rgb(0.72, 0.16, 0.16);
  const info = rgb(0.1, 0.36, 0.62);

  let page: PDFPage = pdf.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  const newPage = () => {
    page = pdf.addPage([A4.width, A4.height]);
    y = A4.height - MARGIN;
  };
  const ensure = (needed: number) => {
    if (y - needed < PAGE_BOTTOM) newPage();
  };
  const text = (
    value: string,
    x: number,
    size: number,
    useBold = false,
    color = navy,
    maxWidth = A4.width - MARGIN - x,
  ) => {
    const used = useBold ? bold : font;
    for (const part of wrap(value, used, size, maxWidth)) {
      ensure(size + 4);
      page.drawText(part, { x, y, size, font: used, color });
      y -= size + 3;
    }
  };

  // Header
  page.drawRectangle({ x: 0, y: A4.height - 92, width: A4.width, height: 92, color: rgb(0.96, 0.97, 0.99) });
  page.drawText(settings.hospitalName || "Hospital", {
    x: MARGIN,
    y: A4.height - 40,
    size: 16,
    font: bold,
    color: navy,
  });
  page.drawText(
    [settings.addressLine1, settings.phone].filter(Boolean).join("  ·  ") || "Laboratory Services",
    { x: MARGIN, y: A4.height - 58, size: 8.5, font, color: muted },
  );
  page.drawText("LABORATORY REPORT", {
    x: MARGIN,
    y: A4.height - 80,
    size: 11,
    font: bold,
    color: navy,
  });
  y = A4.height - 110;

  // Patient / order meta
  const meta: [string, string][] = [
    ["Patient", order.patient.name],
    ["UHID", order.patient.uhid],
    ["Age / Gender", `${order.patient.age} yrs / ${order.patient.gender}`],
    ["Phone", order.patient.phone],
    ["Accession No", order.orderNo],
    ["Report No", order.reportNo || order.orderNo],
    ["Referred By", order.orderedBy?.name ?? "—"],
    ["Department", order.department || "Laboratory Medicine"],
    ["Sample", order.sampleType || "—"],
    [
      "Collected",
      order.sampleCollectedAt ? order.sampleCollectedAt.toISOString().slice(0, 16).replace("T", " ") : "—",
    ],
    [
      "Reported",
      (order.verifiedAt ?? order.createdAt).toISOString().slice(0, 16).replace("T", " "),
    ],
    ["Priority", order.priority || "ROUTINE"],
  ];
  const colWidth = (A4.width - MARGIN * 2) / 2;
  for (let i = 0; i < meta.length; i += 2) {
    ensure(16);
    const pair = meta.slice(i, i + 2);
    pair.forEach(([label, value], index) => {
      const x = MARGIN + index * colWidth;
      page.drawText(`${label}:`, { x, y, size: 8.5, font: bold, color: muted });
      page.drawText(value.slice(0, 48), { x: x + 62, y, size: 8.5, font, color: navy });
    });
    y -= 14;
  }
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.width - MARGIN, y }, thickness: 0.8, color: line });
  y -= 18;

  if (order.tests && order.tests.length > 1) {
    text(
      `Tests: ${order.tests.map((test) => test.testName).join("  ·  ")}`,
      40,
      8.5,
      false,
      muted,
    );
    y -= 4;
  }

  // Results table
  if (order.results.length === 0) {
    text("Result", MARGIN, 9, true);
    text(order.testName, MARGIN, 9);
  } else {
    let section = "";
    for (const row of order.results) {
      const rowSection = row.section?.trim() || "Results";
      if (rowSection !== section) {
        section = rowSection;
        ensure(24);
        y -= 4;
        page.drawRectangle({ x: MARGIN, y: y - 4, width: A4.width - MARGIN * 2, height: 16, color: rgb(0.94, 0.96, 0.99) });
        page.drawText(section.toUpperCase(), { x: MARGIN + 4, y, size: 8, font: bold, color: navy });
        y -= 16;
      }
      ensure(18);
      page.drawText(row.parameterName.slice(0, 46), { x: MARGIN + 4, y, size: 9, font, color: navy });
      const valueX = MARGIN + 240;
      const value = `${row.resultValue}${row.unit ? ` ${row.unit}` : ""}`;
      page.drawText(value.slice(0, 24), {
        x: valueX,
        y,
        size: 9,
        font: bold,
        color: row.flag === "HIGH" ? danger : row.flag === "LOW" ? info : navy,
      });
      if (row.flag === "HIGH" || row.flag === "LOW") {
        page.drawText(row.flag, { x: valueX + 110, y, size: 7, font: bold, color: row.flag === "HIGH" ? danger : info });
      }
      page.drawText((row.referenceRange ?? "—").slice(0, 34), {
        x: MARGIN + 380,
        y,
        size: 8.5,
        font,
        color: muted,
      });
      y -= 15;
      page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: A4.width - MARGIN, y: y + 4 }, thickness: 0.4, color: line });
    }
  }

  if (order.findings?.trim()) {
    y -= 10;
    ensure(40);
    text("Remarks", MARGIN, 9, true);
    text(order.findings.trim(), MARGIN, 8.5, false, navy);
  }

  y -= 16;
  ensure(60);
  page.drawText("Reference intervals vary with age, gender and method. Please interpret with the clinical picture.", {
    x: MARGIN,
    y,
    size: 7.5,
    font,
    color: muted,
  });
  y -= 34;
  page.drawLine({ start: { x: MARGIN + 20, y }, end: { x: MARGIN + 180, y }, thickness: 0.6, color: line });
  page.drawLine({ start: { x: A4.width - MARGIN - 180, y }, end: { x: A4.width - MARGIN - 20, y }, thickness: 0.6, color: line });
  page.drawText(order.verifiedBy?.name ?? "Laboratory officer", { x: MARGIN + 20, y: y - 12, size: 8.5, font: bold, color: navy });
  page.drawText("Verified by", { x: MARGIN + 20, y: y - 22, size: 7.5, font, color: muted });
  page.drawText("Authorised signatory", { x: A4.width - MARGIN - 180, y: y - 22, size: 7.5, font, color: muted });

  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    current.drawText(
      `${settings.hospitalName || "Hospital"} · ${order.orderNo} · Page ${index + 1} of ${pages.length}`,
      { x: MARGIN, y: 30, size: 7, font, color: muted },
    );
  });

  return pdf.save();
}
