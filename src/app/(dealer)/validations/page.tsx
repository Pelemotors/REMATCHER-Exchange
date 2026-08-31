"use client";

import { useEffect, useState } from "react";
import { PageHeader, LoadingSpinner } from "@/components/ui/common";
import { COPY } from "@/config/brand";

interface Validation {
  id: string;
  type: "AVAILABILITY" | "B2B_PRICE";
  vehicle: { make: string; model: string; year: number };
}

export default function ValidationsPage() {
  const [items, setItems] = useState<Validation[]>([]);
  const [loading, setLoading] = useState(true);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});

  async function load() {
    const res = await fetch("/api/validations");
    setItems(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function respondAvailability(id: string, available: boolean) {
    await fetch("/api/validations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ validationId: id, available }),
    });
    load();
  }

  async function submitPrice(id: string) {
    const b2bPrice = priceInputs[id];
    if (!b2bPrice) return;
    await fetch("/api/validations/b2b-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ validationId: id, b2bPrice }),
    });
    load();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="נדרש אימות"
        subtitle="אימות ≠ עניין — לא נוצר חיוב"
      />

      <div className="space-y-4">
        {items.map((v) => (
          <div key={v.id} className="card space-y-3">
            <p className="text-label text-text-muted">{COPY.validationContext}</p>
            <p className="text-h3 font-bold text-ink">
              {v.vehicle.make} {v.vehicle.model} {v.vehicle.year}
            </p>

            {v.type === "AVAILABILITY" ? (
              <>
                <p className="text-body font-semibold text-ink">
                  {COPY.validationAvailability}
                </p>
                <div className="flex gap-3 pt-1">
                  <button
                    className="btn-primary flex-1"
                    onClick={() => respondAvailability(v.id, true)}
                  >
                    כן, זמין
                  </button>
                  <button
                    className="btn-secondary flex-1"
                    onClick={() => respondAvailability(v.id, false)}
                  >
                    נמכר
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-body font-semibold text-ink">
                  {COPY.validationB2bPrice}
                </p>
                <div className="flex gap-3">
                  <input
                    type="text"
                    className="input flex-1"
                    placeholder="134,000 ₪"
                    dir="ltr"
                    value={priceInputs[v.id] ?? ""}
                    onChange={(e) =>
                      setPriceInputs((prev) => ({
                        ...prev,
                        [v.id]: e.target.value,
                      }))
                    }
                  />
                  <button
                    className="btn-primary shrink-0"
                    onClick={() => submitPrice(v.id)}
                  >
                    אישור מחיר
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-center text-sm text-text-muted">
            אין אימותים ממתינים
          </p>
        )}
      </div>
    </div>
  );
}
