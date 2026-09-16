"use client";

/**
 * Printing is the whole export story.
 *
 * A stat sheet gets handed round a dressing room on paper or sent on as a
 * PDF, and the browser already does both — so the report carries a print
 * stylesheet (see globals.css) rather than this project carrying a PDF
 * library it would otherwise have no use for.
 */
export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn-outline no-print text-xs">
      Print / Save as PDF
    </button>
  );
}
