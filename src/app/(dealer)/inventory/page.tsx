"use client";

import { useEffect, useState } from "react";
import {
  BadgeV2,
  ButtonV2,
  DataValue,
  EmptyStateV2,
  PageHeaderV2,
  SkeletonBlockV2,
  Surface,
} from "@/components/ui/brand-v2";
import { InventoryImportPanel } from "@/components/inventory/inventory-import";
import { freshnessLabel, vehicleStatusLabel } from "@/lib/status-labels";
import { formatCurrency, formatNumber } from "@/lib/utils";
import styles from "./inventory.module.css";

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
      <div className={styles.page}>
        <PageHeaderV2
          title="המלאי שלי"
          subtitle="רק המלאי שלך — לא גלישה ברשת"
        />
        <SkeletonBlockV2 lines={4} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeaderV2
        title="המלאי שלי"
        subtitle="רק המלאי שלך — לא גלישה ברשת"
        action={
          <div className="flex gap-2">
            <ButtonV2 variant="secondary" onClick={() => setShowImport(!showImport)}>
              ייבוא קובץ
            </ButtonV2>
            <ButtonV2 variant="signal" onClick={() => setShowAdd(true)}>
              + הוסף
            </ButtonV2>
          </div>
        }
      />

      {showImport && <InventoryImportPanel onComplete={load} />}

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-6">
          <Surface depth="raised" className="space-y-4 p-4">
            <h3 className="font-semibold text-v2-text-primary">הוספת רכב (טקסט חופשי)</h3>
            <textarea
              className="input min-h-[100px]"
              placeholder='לדוגמה: Mazda CX-5 Premium 2023 61K km לבן B2B 134000'
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              required
            />
            <div className="flex gap-3">
              <ButtonV2 type="submit" variant="signal" className="flex-1" disabled={submitting}>
                {submitting ? "מעבד..." : "הוסף ונרמל"}
              </ButtonV2>
              <ButtonV2 variant="secondary" onClick={() => setShowAdd(false)}>
                ביטול
              </ButtonV2>
            </div>
          </Surface>
        </form>
      )}

      {vehicles.length === 0 ? (
        <EmptyStateV2
          title="אין רכבים במלאי"
          description="הוסף רכבים כדי שהמערכת תוכל לחפש התאמות ברקע"
          action={
            <ButtonV2 variant="signal" onClick={() => setShowAdd(true)}>
              הוסף רכב ראשון
            </ButtonV2>
          }
        />
      ) : (
        <div className={styles.grid}>
          {vehicles.map((v) => (
            <Surface key={v.id} depth="raised" className={styles.card}>
              <h3 className="font-bold text-v2-text-primary">
                {[v.make, v.model].filter(Boolean).join(" ") || "רכב"}
              </h3>
              <p className="text-sm text-v2-text-secondary">{v.year}</p>
              <div className="mt-3 flex justify-between text-sm">
                <span className="text-v2-text-secondary">{formatNumber(v.mileage)} ק&quot;מ</span>
                <DataValue size="sm">{formatCurrency(v.b2bPrice)}</DataValue>
              </div>
              <div className="mt-2 flex gap-2">
                <BadgeV2 variant="neutral">{freshnessLabel(v.freshnessState)}</BadgeV2>
                <BadgeV2 variant="neutral">{vehicleStatusLabel(v.status)}</BadgeV2>
              </div>
            </Surface>
          ))}
        </div>
      )}
    </div>
  );
}
