"use client";

import { useEffect, useState } from "react";
import { PageHeader, LoadingSpinner, EmptyState } from "@/components/ui/common";
import { InventoryImportPanel } from "@/components/inventory/inventory-import";
import { freshnessLabel, vehicleStatusLabel } from "@/lib/status-labels";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface Vehicle {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  mileage: number | null;
  b2bPrice: number | null;
  status: string;
  freshnessState: string;
}

export default function InventoryPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [rawInput, setRawInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const res = await fetch("/api/inventory");
    const data = await res.json();
    setVehicles(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawInput }),
    });
    setRawInput("");
    setShowAdd(false);
    setSubmitting(false);
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
        title="המלאי שלי"
        subtitle="רק המלאי שלך — לא גלישה ברשת"
        action={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setShowImport(!showImport)}>
              ייבוא קובץ
            </button>
            <button className="btn-primary" onClick={() => setShowAdd(true)}>
              + הוסף
            </button>
          </div>
        }
      />

      {showImport && <InventoryImportPanel onComplete={load} />}

      {showAdd && (
        <form onSubmit={handleAdd} className="card mb-6 space-y-4">
          <h3 className="font-semibold">הוספת רכב (טקסט חופשי)</h3>
          <textarea
            className="input min-h-[100px]"
            placeholder='לדוגמה: Mazda CX-5 Premium 2023 61K km לבן B2B 134000'
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            required
          />
          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1" disabled={submitting}>
              {submitting ? "מעבד..." : "הוסף ונרמל"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowAdd(false)}
            >
              ביטול
            </button>
          </div>
        </form>
      )}

      {vehicles.length === 0 ? (
        <EmptyState
          title="אין רכבים במלאי"
          description="הוסף רכבים כדי שהמערכת תוכל לחפש התאמות ברקע"
          action={
            <button className="btn-primary" onClick={() => setShowAdd(true)}>
              הוסף רכב ראשון
            </button>
          }
        />
      ) : (
        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 lg:grid-cols-3">
          {vehicles.map((v) => (
            <div key={v.id} className="card">
              <h3 className="font-bold">
                {[v.make, v.model].filter(Boolean).join(" ") || "רכב"}
              </h3>
              <p className="text-sm text-text-secondary">{v.year}</p>
              <div className="mt-3 flex justify-between text-sm">
                <span>{formatNumber(v.mileage)} ק&quot;מ</span>
                <span className="font-semibold text-signal">
                  {formatCurrency(v.b2bPrice)}
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                <span className="badge-neutral">{freshnessLabel(v.freshnessState)}</span>
                <span className="badge">{vehicleStatusLabel(v.status)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
