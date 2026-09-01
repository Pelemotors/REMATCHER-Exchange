"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BRAND } from "@/config/brand";
import { BrandWordmark } from "@/components/brand/brand-wordmark";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("אימייל או סיסמה שגויים");
      return;
    }

    const redirectPath = callbackUrl
      ? `/auth/redirect?callbackUrl=${encodeURIComponent(callbackUrl)}`
      : "/auth/redirect";
    router.push(redirectPath);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card mx-auto w-full max-w-md space-y-6">
      <div className="flex flex-col items-center text-center">
        <BrandWordmark />
        <p className="mt-3 text-body text-text-secondary">{BRAND.tagline}</p>
      </div>

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

      <div>
        <label className="label" htmlFor="password">
          סיסמה
        </label>
        <input
          id="password"
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          dir="ltr"
        />
      </div>

      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? "מתחבר..." : "כניסה"}
      </button>

      <p className="text-center text-sm text-text-secondary">
        עדיין לא ב-Exchange?{" "}
        <Link href="/signup" className="font-medium text-signal">
          הצטרף לרשת
        </Link>
      </p>
    </form>
  );
}
