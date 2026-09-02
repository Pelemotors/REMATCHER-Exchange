"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ButtonV2, Surface } from "@/components/ui/brand-v2";
import { BRAND } from "@/config/brand";

export function SignupForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    businessName: "",
    phone: "",
    email: "",
    city: "",
    region: "",
    businessId: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "ההרשמה נכשלה");
      return;
    }

    router.push(`/verify-email?email=${encodeURIComponent(form.email)}&sent=1`);
  }

  return (
    <form onSubmit={handleSubmit}>
      <Surface depth="raised" className="mx-auto w-full max-w-lg space-y-4 p-6">
        <div className="text-center">
          <h1 className="text-h2 font-bold text-v2-warm">הצטרפות ל-{BRAND.product}</h1>
          <p className="mt-2 text-sm text-v2-text-secondary">
            רשת פרטית לסוחרי רכב מאומתים
          </p>
        </div>

        {error && (
          <div className="rounded-sm bg-error-soft px-3 py-2 text-sm text-error">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">שם מלא</label>
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">שם העסק / הסוכנות</label>
            <input
              className="input"
              required
              value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })}
            />
          </div>
          <div>
            <label className="label">טלפון</label>
            <input
              className="input"
              required
              dir="ltr"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <label className="label">אימייל</label>
            <input
              className="input"
              type="email"
              required
              dir="ltr"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="label">עיר</label>
            <input
              className="input"
              required
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <div>
            <label className="label">אזור</label>
            <input
              className="input"
              placeholder="מרכז, צפון..."
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">ח.פ. / עוסק (אופציונלי)</label>
            <input
              className="input"
              value={form.businessId}
              onChange={(e) => setForm({ ...form, businessId: e.target.value })}
            />
          </div>
          <div>
            <label className="label">סיסמה</label>
            <input
              className="input"
              type="password"
              required
              minLength={8}
              dir="ltr"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div>
            <label className="label">אישור סיסמה</label>
            <input
              className="input"
              type="password"
              required
              dir="ltr"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            />
          </div>
        </div>

        <ButtonV2 type="submit" variant="signal" className="w-full" disabled={loading}>
          {loading ? "נרשם..." : "הצטרפות ל-Exchange"}
        </ButtonV2>

        <p className="text-center text-sm text-v2-text-secondary">
          כבר יש לך חשבון?{" "}
          <Link href="/login" className="font-medium text-v2-signal">
            התחבר
          </Link>
        </p>
      </Surface>
    </form>
  );
}
