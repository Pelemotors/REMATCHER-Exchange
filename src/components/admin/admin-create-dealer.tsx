"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ButtonV2, Surface } from "@/components/ui/brand-v2";

export function AdminCreateDealer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    businessName: "",
    contactName: "",
    phone: "",
    email: "",
    city: "",
    password: "",
    activateNow: true,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/dealers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(
        data.error === "email_exists"
          ? "כבר קיים משתמש עם המייל הזה"
          : data.error === "password_too_short"
            ? "הסיסמה חייבת להכיל לפחות 8 תווים"
            : "לא הצלחתי ליצור את המשתמש"
      );
      return;
    }
    router.push(`/admin/dealers/${data.dealerId}`);
    router.refresh();
  }

  if (!open) {
    return (
      <ButtonV2 variant="signal" onClick={() => setOpen(true)}>
        הוסף סוחר
      </ButtonV2>
    );
  }

  return (
    <Surface depth="raised" className="mb-6 p-4">
      <form onSubmit={submit} className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-v2-text-primary">יצירת סוחר חדש</h2>
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-v2-text-muted">סגור</button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input className="input" placeholder="שם העסק" required value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
          <input className="input" placeholder="איש קשר" required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          <input className="input" placeholder="טלפון" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="input" type="email" placeholder="מייל" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="עיר (אופציונלי)" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <input className="input" type="password" minLength={8} placeholder="סיסמה התחלתית — לפחות 8 תווים" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm text-v2-text-secondary">
          <input type="checkbox" checked={form.activateNow} onChange={(e) => setForm({ ...form, activateNow: e.target.checked })} />
          אשר והפעל מיד, כולל אימות מייל מנהלי
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <ButtonV2 variant="signal" disabled={loading} type="submit">
          {loading ? "יוצר..." : "צור משתמש וסוחר"}
        </ButtonV2>
      </form>
    </Surface>
  );
}
