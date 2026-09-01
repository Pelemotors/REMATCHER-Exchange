"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { PublicLayout } from "@/components/public/public-layout";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const sent = searchParams.get("sent");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    token ? "loading" : "idle"
  );
  const [message, setMessage] = useState(
    sent ? "שלחנו לך מייל לאימות. בדוק את תיבת הדואר." : ""
  );

  useEffect(() => {
    if (!token) return;

    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setStatus("success");
          setMessage(data.message);
        } else {
          setStatus("error");
          setMessage(data.error);
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("שגיאה באימות. נסה שוב.");
      });
  }, [token]);

  async function resend() {
    if (!email) return;
    await fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setMessage("שלחנו שוב מייל לאימות.");
  }

  return (
    <div className="card mx-auto max-w-md space-y-4 text-center">
      <h1 className="text-h2 font-bold">אימות אימייל</h1>

      {status === "loading" && <p className="text-text-secondary">מאמת...</p>}

      {message && (
        <p
          className={
            status === "error" ? "text-error" : "text-text-secondary"
          }
        >
          {message}
        </p>
      )}

      {status === "success" && (
        <Link href="/login" className="btn-primary inline-block">
          המשך להתחברות
        </Link>
      )}

      {email && status !== "success" && (
        <button type="button" className="btn-secondary w-full" onClick={resend}>
          שלח שוב מייל אימות
        </button>
      )}

      <Link href="/login" className="block text-sm text-signal">
        חזרה להתחברות
      </Link>
    </div>
  );
}

export function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="text-center">טוען...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
