"use client";

import { useState } from "react";
import { LoadingSpinner } from "@/components/ui/common";
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
    <div className="card mb-6 space-y-4">
      <h3 className="font-semibold">ייבוא מלאי מקובץ</h3>
      <p className="text-sm text-text-secondary">
        העלה קובץ CSV או Excel — נזהה עמודות, נציג תצוגה מקדימה ורק אז נייבא
      </p>

      <input
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleFile}
        className="block w-full text-sm"
      />

      {loading && (
        <div className="flex justify-center py-4">
          <LoadingSpinner />
        </div>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      {preview && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div className="rounded-lg bg-surface-secondary p-3 text-center">
              <p className="font-bold">{preview.summary.total}</p>
              <p className="text-text-secondary">שורות</p>
            </div>
            <div className="rounded-lg bg-success-soft p-3 text-center">
              <p className="font-bold">{preview.diff.newCount}</p>
              <p className="text-text-secondary">חדשים</p>
            </div>
            <div className="rounded-lg bg-surface-secondary p-3 text-center">
              <p className="font-bold">{preview.diff.stillActiveCount}</p>
              <p className="text-text-secondary">עדיין במלאי</p>
            </div>
            <div className="rounded-lg bg-warning-soft p-3 text-center">
              <p className="font-bold">{preview.diff.missingFromFile.length}</p>
              <p className="text-text-secondary">לא בקובץ</p>
            </div>
          </div>

          {preview.summary.needsAttention > 0 && (
            <p className="text-sm text-warning">
              {preview.summary.needsAttention} שורות דורשות תשומת לב — ייובאו רק שורות תקינות
            </p>
          )}

          {preview.diff.missingFromFile.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
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
                className={`border-b border-border py-2 ${row.skip ? "opacity-50" : ""}`}
              >
                <span className="font-medium">
                  {[row.fields.make, row.fields.model, row.fields.year]
                    .filter(Boolean)
                    .join(" ") || `שורה ${row.rowIndex}`}
                </span>
                {row.warnings.length > 0 && (
                  <span className="mr-2 text-warning"> · {row.warnings[0]}</span>
                )}
                {row.duplicateOfVehicleId && (
                  <span className="mr-2 text-text-muted"> · עדכון קיים</span>
                )}
              </div>
            ))}
            {preview.rows.length > 20 && (
              <p className="py-2 text-text-muted">
                +{preview.rows.length - 20} שורות נוספות
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={handleConfirm}
              disabled={loading}
            >
              אשר ייבוא
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPreview(null)}
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
