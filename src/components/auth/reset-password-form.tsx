"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BrandWordmark } from "@/components/brand/brand-wordmark";

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
      <div className="card w-full max-w-md text-center">
        <p className="text-text-secondary">קישור לא תקין.</p>
        <Link href="/forgot-password" className="btn-primary mt-4 inline-block">
          בקש קישור חדש
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card w-full max-w-md space-y-6">
      <div className="flex flex-col items-center text-center">
        <BrandWordmark />
        <h1 className="mt-4 text-h3 font-semibold">סיסמה חדשה</h1>
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

      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? "מעדכן..." : "עדכן סיסמה"}
      </button>
    </form>
  );
}
