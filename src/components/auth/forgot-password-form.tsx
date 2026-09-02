"use client";

import { useState } from "react";
import Link from "next/link";
import { ButtonV2, Surface } from "@/components/ui/brand-v2";
import { ExchangeMark } from "@/components/brand/exchange-mark";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);

    if (res.status === 429) {
      setError("בוצעו יותר מדי בקשות. נסה שוב מאוחר יותר.");
      return;
    }

    setSent(true);
  }

  return (
    <form onSubmit={handleSubmit}>
      <Surface depth="raised" className="w-full max-w-md space-y-6 p-6">
        <div className="flex flex-col items-center text-center">
          <ExchangeMark state="idle" size={56} decorative />
          <h1 className="mt-4 text-h3 font-semibold text-v2-warm">איפוס סיסמה</h1>
        </div>

        {sent ? (
          <p className="text-center text-sm text-v2-text-secondary">
            אם כתובת האימייל רשומה במערכת, נשלח אליך קישור לאיפוס סיסמה.
          </p>
        ) : (
          <>
            {error && (
              <div className="rounded-sm bg-error-soft px-3 py-2 text-small text-error">
                {error}
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">
                אימייל
              </label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                dir="ltr"
              />
            </div>
            <ButtonV2 type="submit" variant="signal" className="w-full" disabled={loading}>
              {loading ? "שולח..." : "שלח קישור לאיפוס"}
            </ButtonV2>
          </>
        )}

        <p className="text-center text-sm">
          <Link href="/login" className="text-v2-signal">
            חזרה להתחברות
          </Link>
        </p>
      </Surface>
    </form>
  );
}
