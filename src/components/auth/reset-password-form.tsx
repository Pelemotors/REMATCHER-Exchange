"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ButtonV2, Surface } from "@/components/ui/brand-v2";
import { ExchangeMark } from "@/components/brand/exchange-mark";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password, confirmPassword }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "לא הצלחנו לאפס את הסיסמה");
      return;
    }

    router.push("/login?reset=1");
  }

  if (!token) {
    return (
      <Surface depth="raised" className="w-full max-w-md p-6 text-center">
        <p className="text-v2-text-secondary">קישור לא תקין.</p>
        <ButtonV2 variant="signal" href="/forgot-password" className="mt-4">
          בקש קישור חדש
        </ButtonV2>
      </Surface>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Surface depth="raised" className="w-full max-w-md space-y-6 p-6">
        <div className="flex flex-col items-center text-center">
          <ExchangeMark state="idle" size={56} decorative />
          <h1 className="mt-4 text-h3 font-semibold text-v2-warm">סיסמה חדשה</h1>
        </div>

        {error && (
          <div className="rounded-sm bg-error-soft px-3 py-2 text-small text-error">
            {error}
          </div>
        )}

        <div>
          <label className="label" htmlFor="password">
            סיסמה חדשה
          </label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            dir="ltr"
          />
        </div>

        <div>
          <label className="label" htmlFor="confirmPassword">
            אימות סיסמה
          </label>
          <input
            id="confirmPassword"
            type="password"
            className="input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            dir="ltr"
          />
        </div>

        <ButtonV2 type="submit" variant="signal" className="w-full" disabled={loading}>
          {loading ? "מעדכן..." : "עדכן סיסמה"}
        </ButtonV2>
      </Surface>
    </form>
  );
}
