"use client";

import { Printer } from "./icons";

/**
 * Prints the current page. When `selector` points to a table whose rows carry
 * `data-print-row` with a checkbox (`data-print-checkbox`) inside, unchecked
 * rows are hidden for the print job only (via Tailwind's `print:hidden`),
 * then restored once the print dialog closes — so "select some rows, then
 * print" works without a separate print preview page.
 */
export function PrintButton({ selector, label = "Print" }: { selector?: string; label?: string }) {
  function handlePrint() {
    const toggled: HTMLElement[] = [];
    if (selector) {
      const rows = document.querySelectorAll<HTMLElement>(`${selector} [data-print-row]`);
      rows.forEach((row) => {
        const checkbox = row.querySelector<HTMLInputElement>("[data-print-checkbox]");
        if (checkbox && !checkbox.checked) {
          row.classList.add("print:hidden");
          toggled.push(row);
        }
      });
    }
    const cleanup = () => {
      toggled.forEach((el) => el.classList.remove("print:hidden"));
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    // Safari doesn't reliably fire afterprint — fall back after a delay.
    setTimeout(cleanup, 2000);
  }

  return (
    <button type="button" onClick={handlePrint} className="btn-secondary print:hidden">
      <Printer size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
