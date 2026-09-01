"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandWordmark } from "@/components/brand/brand-wordmark";

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
    <form onSubmit={handleSubmit} className="card w-full max-w-md space-y-6">
      <div className="flex flex-col items-center text-center">
        <BrandWordmark />
        <h1 className="mt-4 text-h3 font-semibold">איפוס סיסמה</h1>
      </div>

      {sent ? (
        <p className="text-center text-sm text-text-secondary">
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
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "שולח..." : "שלח קישור לאיפוס"}
          </button>
        </>
      )}

      <p className="text-center text-sm">
        <Link href="/login" className="text-signal">
          חזרה להתחברות
        </Link>
      </p>
    </form>
  );
}
