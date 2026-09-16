"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ADMIN_AUTH_BASE = "/api/admin/auth";

/** Signs out admin session only — does not touch dealer auth cookies. */
export function AdminLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    if (loading) return;
    setLoading(true);
    try {
      const csrfRes = await fetch(`${ADMIN_AUTH_BASE}/csrf`);
      const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };
      if (csrfToken) {
        await fetch(`${ADMIN_AUTH_BASE}/signout`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            csrfToken,
            redirect: "false",
            json: "true",
          }),
        });
      }
    } finally {
      router.replace("/admin");
      router.refresh();
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="text-sm text-white/45 transition hover:text-white/75 disabled:opacity-50"
    >
      {loading ? "יוצא..." : "יציאה"}
    </button>
  );
}
