"use client";

import { useState } from "react";

export function AdminTestPushButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function sendTest() {
    setLoading(true);
    setMessage(null);
    setIsError(false);
    try {
      const res = await fetch("/api/admin/push/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setIsError(true);
        setMessage(data.error ?? "שליחת בדיקה נכשלה");
        return;
      }
      setMessage(`נשלחו ${data.sent} התראות (${data.failed} נכשלו)`);
    } catch {
      setIsError(true);
      setMessage("שליחת בדיקה נכשלה");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn-primary text-sm"
        onClick={sendTest}
        disabled={loading}
      >
        {loading ? "שולח..." : "שלח התראת בדיקה"}
      </button>
      {message && (
        <p className={`text-sm ${isError ? "text-error" : "text-success"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
