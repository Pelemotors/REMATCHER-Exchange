"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ButtonV2, Surface } from "@/components/ui/brand-v2";
import type { InventoryVehicle } from "@/components/inventory/inventory-page-client";

export function InventoryEnrichmentPanel({ vehicle }: { vehicle: InventoryVehicle }) {
  const router = useRouter();
  const [fields, setFields] = useState<Array<{ key: string; label: string }>>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/inventory/enrichment?vehicleId=${encodeURIComponent(vehicle.id)}`
        );
        if (!res.ok) throw new Error("enrichment_load_failed");
        const data = await res.json();
        if (!cancelled) setFields(Array.isArray(data.fields) ? data.fields : []);
      } catch {
        if (!cancelled) setError("לא הצלחנו לטעון את הפרטים החסרים. נסה שוב.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vehicle.id]);

  async function save() {
    if (saving || fields.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/enrichment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId: vehicle.id, values }),
      });
      if (!res.ok) throw new Error("enrichment_save_failed");
      router.replace("/inventory?filter=active");
      router.refresh();
    } catch {
      setError("לא הצלחנו לעדכן. שום דבר לא השתנה.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Surface depth="raised" className="mb-4 space-y-3 border border-v2-signal/30 p-4">
      <h3 className="font-semibold text-v2-text-primary">
        {[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ") || "רכב"}
      </h3>
      <p className="text-sm text-v2-text-secondary">
        יש ביקוש שעשוי להתאים לרכב הזה. חסרים לנו כמה פרטים כדי לבדוק אם זו התאמה אמיתית.
      </p>

      {loading ? (
        <p className="text-sm text-v2-text-muted">טוען פרטים חסרים...</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="label">
                {field.key === "price" ? "מחיר" : field.label}
              </label>
              <input
                className="input"
                inputMode={
                  ["price", "mileage", "year", "hand"].includes(field.key)
                    ? "numeric"
                    : "text"
                }
                placeholder={
                  field.key === "price"
                    ? "באיזה מחיר תרצה להציע את הרכב?"
                    : field.label
                }
                value={values[field.key] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <ButtonV2
          variant="signal"
          onClick={save}
          disabled={loading || saving || fields.length === 0}
        >
          {saving ? "מעדכן..." : "עדכן ובדוק התאמה"}
        </ButtonV2>
        <ButtonV2 variant="ghost" href="/inventory?filter=active">
          ביטול
        </ButtonV2>
      </div>
    </Surface>
  );
}
