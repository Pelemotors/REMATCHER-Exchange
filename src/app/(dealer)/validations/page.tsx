"use client";

import { useEffect, useState } from "react";
import {
  ButtonV2,
  PageHeaderV2,
  SkeletonBlockV2,
  Surface,
} from "@/components/ui/brand-v2";
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
      <div>
        <PageHeaderV2
          title="נדרש אימות"
          subtitle="אימות ≠ עניין — לא נוצר חיוב"
        />
        <SkeletonBlockV2 lines={4} />
      </div>
    );
  }

  return (
    <div>
      <PageHeaderV2
        title="נדרש אימות"
        subtitle="אימות ≠ עניין — לא נוצר חיוב"
      />

      <div className="space-y-4">
        {items.map((v) => (
          <Surface key={v.id} depth="raised" className="space-y-3 p-4">
            <p className="text-label text-v2-text-muted">{COPY.validationContext}</p>
            <p className="text-h3 font-bold text-v2-warm">
              {v.vehicle.make} {v.vehicle.model} {v.vehicle.year}
            </p>

            {v.type === "AVAILABILITY" ? (
              <>
                <p className="text-body font-semibold text-v2-text-primary">
                  {COPY.validationAvailability}
                </p>
                <div className="flex gap-3 pt-1">
                  <ButtonV2
                    variant="signal"
                    className="flex-1"
                    onClick={() => respondAvailability(v.id, true)}
                  >
                    כן, זמין
                  </ButtonV2>
                  <ButtonV2
                    variant="secondary"
                    className="flex-1"
                    onClick={() => respondAvailability(v.id, false)}
                  >
                    נמכר
                  </ButtonV2>
                </div>
              </>
            ) : (
              <>
                <p className="text-body font-semibold text-v2-text-primary">
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
                  <ButtonV2
                    variant="signal"
                    className="shrink-0"
                    onClick={() => submitPrice(v.id)}
                  >
                    אישור מחיר
                  </ButtonV2>
                </div>
              </>
            )}
          </Surface>
        ))}
        {items.length === 0 && (
          <p className="text-center text-sm text-v2-text-muted">
            אין אימותים ממתינים
          </p>
        )}
      </div>
    </div>
  );
}
