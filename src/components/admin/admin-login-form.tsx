"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand/brand-mark";

const ADMIN_AUTH_BASE = "/api/admin/auth";

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");

    try {
      const csrfRes = await fetch(`${ADMIN_AUTH_BASE}/csrf`);
      if (!csrfRes.ok) {
        setError("לא ניתן להתחבר כרגע. נסה שוב.");
        setLoading(false);
        return;
      }
      const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };
      if (!csrfToken) {
        setError("לא ניתן להתחבר כרגע. נסה שוב.");
        setLoading(false);
        return;
      }

      const res = await fetch(`${ADMIN_AUTH_BASE}/callback/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          csrfToken,
          email: email.trim().toLowerCase(),
          password,
          redirect: "false",
          json: "true",
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        url?: string;
      } | null;

      if (!res.ok || data?.error || data?.ok === false) {
        setError("האימייל או הסיסמה אינם נכונים, או שאין הרשאת מערכת");
        setLoading(false);
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch {
      setError("שגיאת רשת. נסה שוב.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-6 rounded-lg border border-white/10 bg-[#0e1624] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
      >
        <div className="flex flex-col items-center text-center">
          <BrandMark size={48} variant="gold" preferPng />
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-[#f3f1ec]">
            REMATCHER Exchange — System Administration
          </h1>
          <p className="mt-2 text-sm text-white/50">
            כניסה למנהלי מערכת בלבד · סשן נפרד מסוחרי Exchange
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-500/15 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm text-white/60" htmlFor="admin-email">
            אימייל מנהל
          </label>
          <input
            id="admin-email"
            type="email"
            className="w-full rounded-md border border-white/15 bg-[#1a2535] px-3 py-2 text-[#f3f1ec] outline-none focus:border-amber-500/50"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            dir="ltr"
            autoComplete="username"
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm text-white/60"
            htmlFor="admin-password"
          >
            סיסמה
          </label>
          <input
            id="admin-password"
            type="password"
            className="w-full rounded-md border border-white/15 bg-[#1a2535] px-3 py-2 text-[#f3f1ec] outline-none focus:border-amber-500/50"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            dir="ltr"
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-amber-600/90 px-4 py-2.5 text-sm font-medium text-[#0a0e14] transition hover:bg-amber-500 disabled:opacity-60"
        >
          {loading ? "מתחבר..." : "כניסת מערכת"}
        </button>
      </form>
    </div>
  );
}
