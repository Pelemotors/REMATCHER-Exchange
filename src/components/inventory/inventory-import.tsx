"use client";

import { useState } from "react";
import {
  ButtonV2,
  SkeletonBlockV2,
  Surface,
} from "@/components/ui/brand-v2";
import type { ImportPreview } from "@/services/inventory/import";

interface Props {
  onComplete: () => void;
}

export function InventoryImportPanel({ onComplete }: Props) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markMissing, setMarkMissing] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    setPreview(null);

    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/inventory/import/preview", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error === "EMPTY_FILE" ? "הקובץ ריק או ללא שורות נתונים" : "לא הצלחנו לקרוא את הקובץ");
      return;
    }
    setPreview(data);
  }

  async function handleConfirm() {
    if (!preview) return;
    setLoading(true);
    const res = await fetch("/api/inventory/import/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        importId: preview.importId,
        markMissingAsSold: markMissing,
      }),
    });
    setLoading(false);
    if (res.ok) {
      setPreview(null);
      onComplete();
    } else {
      const data = await res.json();
      setError(data.error ?? "הייבוא נכשל");
    }
  }

  return (
    <Surface depth="raised" className="mb-6 space-y-4 p-4">
      <h3 className="font-semibold text-v2-text-primary">ייבוא מלאי מקובץ</h3>
      <p className="text-sm text-v2-text-secondary">
        העלה קובץ CSV או Excel — נזהה עמודות, נציג תצוגה מקדימה ורק אז נייבא
      </p>

      <input
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleFile}
        className="block w-full text-sm text-v2-text-secondary"
      />

      {loading && <SkeletonBlockV2 lines={2} />}

      {error && <p className="text-sm text-error">{error}</p>}

      {preview && (
        <div className="space-y-4 border-t border-v2-border pt-4">
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <Surface depth="secondary" className="p-3 text-center">
              <p className="font-bold text-v2-warm">{preview.summary.total}</p>
              <p className="text-v2-text-secondary">שורות</p>
            </Surface>
            <Surface depth="secondary" className="bg-success-soft p-3 text-center">
              <p className="font-bold text-v2-warm">{preview.diff.newCount}</p>
              <p className="text-v2-text-secondary">חדשים</p>
            </Surface>
            <Surface depth="secondary" className="p-3 text-center">
              <p className="font-bold text-v2-warm">{preview.diff.stillActiveCount}</p>
              <p className="text-v2-text-secondary">עדיין במלאי</p>
            </Surface>
            <Surface depth="secondary" className="bg-warning-soft p-3 text-center">
              <p className="font-bold text-v2-warm">{preview.diff.missingFromFile.length}</p>
              <p className="text-v2-text-secondary">לא בקובץ</p>
            </Surface>
          </div>

          {preview.summary.needsAttention > 0 && (
            <p className="text-sm text-warning">
              {preview.summary.needsAttention} שורות דורשות תשומת לב — ייובאו רק שורות תקינות
            </p>
          )}

          {preview.diff.missingFromFile.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-v2-text-secondary">
              <input
                type="checkbox"
                checked={markMissing}
                onChange={(e) => setMarkMissing(e.target.checked)}
              />
              סמן רכבים שלא בקובץ כנמכרו (דורש אישור)
            </label>
          )}

          <div className="max-h-48 overflow-y-auto text-sm">
            {preview.rows.slice(0, 20).map((row) => (
              <div
                key={row.rowIndex}
                className={`border-b border-v2-border py-2 ${row.skip ? "opacity-50" : ""}`}
              >
                <span className="font-medium text-v2-text-primary">
                  {[row.fields.make, row.fields.model, row.fields.year]
                    .filter(Boolean)
                    .join(" ") || `שורה ${row.rowIndex}`}
                </span>
                {row.warnings.length > 0 && (
                  <span className="mr-2 text-warning"> · {row.warnings[0]}</span>
                )}
                {row.duplicateOfVehicleId && (
                  <span className="mr-2 text-v2-text-muted"> · עדכון קיים</span>
                )}
              </div>
            ))}
            {preview.rows.length > 20 && (
              <p className="py-2 text-v2-text-muted">
                +{preview.rows.length - 20} שורות נוספות
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <ButtonV2
              variant="signal"
              className="flex-1"
              onClick={handleConfirm}
              disabled={loading}
            >
              אשר ייבוא
            </ButtonV2>
            <ButtonV2 variant="secondary" onClick={() => setPreview(null)}>
              ביטול
            </ButtonV2>
          </div>
        </div>
      )}
    </Surface>
  );
}
