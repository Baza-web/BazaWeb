"use client";

import { addStaffDocuments } from "@/app/(app)/staff/actions";

export function StaffDocumentsForm({ staffId }: { staffId: string }) {
  return (
    <form action={addStaffDocuments.bind(null, staffId)} className="flex flex-wrap items-center gap-2">
      <input className="input text-xs" type="file" name="documents" multiple accept="image/*,.pdf" />
      <button type="submit" className="btn-secondary text-xs">
        Upload
      </button>
    </form>
  );
}
