"use client";

import { useState } from "react";
import { TARGET_LABELS, type QRPickerOption } from "@/lib/qrTargets";

/**
 * Shows only the Target list that matches the currently selected "Points to" type
 * (or the External URL field for Campaign), instead of one flat list mixing every
 * entity type — which let someone pick a Gemstone while "Points to" said Product,
 * silently creating a QR that resolves to "not found" at scan time.
 */
export function QRTargetPicker({
  products,
  gemstones,
  certificates,
  branches,
  tours,
  defaultTargetType = "PRODUCT",
  defaultTargetId,
  defaultExternalUrl,
}: {
  products: QRPickerOption[];
  gemstones: QRPickerOption[];
  certificates: QRPickerOption[];
  branches: QRPickerOption[];
  tours: QRPickerOption[];
  defaultTargetType?: string;
  defaultTargetId?: string | null;
  defaultExternalUrl?: string | null;
}) {
  const [targetType, setTargetType] = useState(defaultTargetType);

  const listsByType: Record<string, QRPickerOption[]> = {
    PRODUCT: products,
    GEMSTONE: gemstones,
    CERTIFICATE: certificates,
    BOUTIQUE: branches,
    TRAVEL_EXPERIENCE: tours,
  };
  const options = listsByType[targetType] ?? [];

  return (
    <>
      <div>
        <label className="label">Points to</label>
        <select
          className="input"
          name="targetType"
          required
          value={targetType}
          onChange={(e) => setTargetType(e.target.value)}
        >
          {Object.entries(TARGET_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {targetType === "CAMPAIGN" ? (
        <div className="sm:col-span-2">
          <label className="label">External URL</label>
          <input
            className="input"
            name="externalUrl"
            type="url"
            required
            defaultValue={defaultExternalUrl ?? ""}
            placeholder="https://instagram.com/bazaboutique"
          />
        </div>
      ) : (
        <div className="sm:col-span-2">
          <label className="label">Target</label>
          {/* key resets the select to its placeholder whenever the type changes, instead of
              keeping a stale selection from the previous type's list */}
          <select className="input" name="targetId" required defaultValue={defaultTargetId ?? ""} key={targetType}>
            <option value="" disabled>
              Choose one…
            </option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {options.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">
              No {TARGET_LABELS[targetType].toLowerCase()} records exist yet to point this at.
            </p>
          )}
        </div>
      )}
    </>
  );
}
