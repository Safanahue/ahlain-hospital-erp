"use client";

import { Download, Printer } from "lucide-react";

/** Print / Save-as-PDF buttons for the #report-area printable documents. */
export default function PrintActions({ label = "Save as PDF" }: { label?: string }) {
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => window.print()} className="btn btn-primary btn-sm">
        <Printer className="h-4 w-4" aria-hidden />
        Print
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="btn btn-secondary btn-sm"
        title="Opens the print dialog — choose 'Save as PDF' for an A4 PDF"
      >
        <Download className="h-4 w-4" aria-hidden />
        {label}
      </button>
    </div>
  );
}
