"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminUserActions({
  userId,
  verified,
  status,
}: {
  userId: string;
  verified: boolean;
  status: string;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/admin/users/${userId}/resend-verification`, {
      method: "POST",
    });
    const data = await res.json().catch(() => null);
    setMsg(data?.alreadyVerified ? "כבר מאומת" : data?.ok ? "נשלח" : "שליחה נכשלה");
    setBusy(false);
    router.refresh();
  }

  async function setStatus(next: "ACTIVE" | "SUSPENDED") {
    if (!confirm(next === "SUSPENDED" ? "להשעות את המשתמש?" : "להפעיל מחדש?")) {
      return;
    }
    setBusy(true);
    await fetch(`/api/admin/users/${userId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {!verified && (
        <button
          type="button"
          disabled={busy}
          onClick={resend}
          className="rounded-lg bg-[#d4af3b] px-3 py-2 text-sm font-semibold text-[#0b1114]"
        >
          שלח אימות מייל מחדש
        </button>
      )}
      {status !== "SUSPENDED" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => setStatus("SUSPENDED")}
          className="rounded-lg border border-white/15 px-3 py-2 text-sm"
        >
          השעיה
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setStatus("ACTIVE")}
          className="rounded-lg border border-white/15 px-3 py-2 text-sm"
        >
          הפעלה מחדש
        </button>
      )}
      {msg && <p className="w-full text-sm text-v2-text-secondary">{msg}</p>}
    </div>
  );
}
