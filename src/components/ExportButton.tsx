import Link from "next/link";
import { FileXls } from "./icons";

/** A download link styled like a button — hits an /api/export/* route directly, no client JS needed. */
export function ExportButton({ href, label = "Export" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="btn-secondary print:hidden">
      <FileXls size={16} aria-hidden="true" />
      {label}
    </Link>
  );
}
