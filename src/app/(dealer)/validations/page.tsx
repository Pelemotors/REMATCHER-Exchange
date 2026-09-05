"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ButtonV2,
  EmptyStateV2,
  PageHeaderV2,
  SkeletonBlockV2,
  Surface,
} from "@/components/ui/brand-v2";

interface Validation {
  id: string;
  type: "AVAILABILITY" | "B2B_PRICE";
  candidateMatchId?: string | null;
  vehicle: {
    make: string | null;
    model: string | null;
    year: number | null;
  };
  candidateMatch?: {
    demand?: {
      confirmedJson?: {
        make?: string;
        model?: string;
        yearMin?: number;
      } | null;
    } | null;
  } | null;
}

function whyNow(v: Validation): string {
  const demand = v.candidateMatch?.demand?.confirmedJson;
  const vehicleName = [v.vehicle.make, v.vehicle.model]
    .filter(Boolean)
    .join(" ");
  const demandName = demand
    ? [demand.make, demand.model].filter(Boolean).join(" ")
    : null;

  if (v.type === "AVAILABILITY") {
    if (demandName) {
      return `יש ביקוש שעשוי להתאים ל-${vehicleName || "רכב"} שלך${demandName ? ` (${demandName})` : ""}. לפני שנציג אותו לצד השני, רק צריך לוודא שהוא עדיין זמין.`;
    }
    return `יש התאמה פוטנציאלית ל-${vehicleName || "רכב"} שלך. לפני שנמשיך, צריך לוודא שהוא עדיין זמין.`;
  }

  if (demandName) {
    return `יש התאמה פוטנציאלית ל-${vehicleName || "רכב"} שלך מול ביקוש ל-${demandName}. מה מחיר ה-B2B העדכני?`;
  }
  return `יש התאמה פוטנציאלית ל-${vehicleName || "רכב"} שלך. מה מחיר ה-B2B העדכני?`;
}

function ValidationsContent() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const [items, setItems] = useState<Validation[]>([]);
  const [loading, setLoading] = useState(true);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [staleFocus, setStaleFocus] = useState(false);

  async function load() {
    const res = await fetch("/api/validations");
    const data = await res.json();
    const list: Validation[] = Array.isArray(data) ? data : [];
    setItems(list);
    setLoading(false);
    if (focusId) {
      const found = list.find(
        (v) => v.id === focusId || v.candidateMatchId === focusId
      );
      setStaleFocus(!found);
      if (found) {
        window.setTimeout(() => {
          document
            .getElementById(`validation-${found.id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 80);
      }
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  async function respondAvailability(id: string, available: boolean) {
    setSubmitting(id);
    await fetch("/api/validations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ validationId: id, available }),
    });
    setSubmitting(null);
    load();
  }

  async function submitPrice(id: string) {
    const b2bPrice = priceInputs[id];
    if (!b2bPrice) return;
    setSubmitting(id);
    await fetch("/api/validations/b2b-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ validationId: id, b2bPrice }),
    });
    setSubmitting(null);
    load();
  }

  if (loading) {
    return (
      <div>
        <PageHeaderV2
          title="דורש אימות"
          subtitle="אימות זמינות או מחיר — לא עניין ולא חיוב"
        />
        <SkeletonBlockV2 lines={4} />
      </div>
    );
  }

  return (
    <div>
      <PageHeaderV2
        title="דורש אימות"
        subtitle="אימות זמינות או מחיר — לא עניין ולא חיוב"
      />
      {staleFocus && (
        <Surface depth="secondary" className="mb-4 px-4 py-3">
          <p className="text-sm text-v2-text-secondary">
            בקשת האימות מההתראה כבר אינה פתוחה. מוצג המצב העדכני.
          </p>
        </Surface>
      )}
      {items.length === 0 ? (
        <EmptyStateV2
          title="אין אימותים ממתינים"
          description="כשתופיע התאמה שדורשת אימות זמינות או מחיר — היא תופיע כאן."
        />
      ) : (
        <div className="space-y-4">
          {items.map((v) => (
            <div
              key={v.id}
              id={`validation-${v.id}`}
              className={
                focusId === v.id || focusId === v.candidateMatchId
                  ? "ring-2 ring-v2-signal rounded-md"
                  : undefined
              }
            >
            <Surface
              depth="raised"
              className="space-y-3 p-4"
            >
              <p className="text-sm text-v2-text-secondary">{whyNow(v)}</p>
              <p className="text-h3 font-bold text-v2-warm">
                {v.vehicle.make} {v.vehicle.model} {v.vehicle.year}
              </p>
              {v.type === "AVAILABILITY" ? (
                <div className="flex gap-2">
                  <ButtonV2
                    variant="signal"
                    disabled={submitting === v.id}
                    onClick={() => respondAvailability(v.id, true)}
                  >
                    כן, עדיין זמין
                  </ButtonV2>
                  <ButtonV2
                    variant="secondary"
                    disabled={submitting === v.id}
                    onClick={() => respondAvailability(v.id, false)}
                  >
                    לא זמין
                  </ButtonV2>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className="input"
                    inputMode="numeric"
                    placeholder="מחיר סוחר"
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
                    disabled={submitting === v.id}
                    onClick={() => submitPrice(v.id)}
                  >
                    שמור מחיר
                  </ButtonV2>
                </div>
              )}
            </Surface>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ValidationsPage() {
  return (
    <Suspense fallback={<SkeletonBlockV2 lines={4} />}>
      <ValidationsContent />
    </Suspense>
  );
}
