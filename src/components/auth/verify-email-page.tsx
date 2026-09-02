"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ButtonV2, Surface } from "@/components/ui/brand-v2";

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
    <Surface depth="raised" className="mx-auto max-w-md space-y-4 p-6 text-center">
      <h1 className="text-h2 font-bold text-v2-warm">אימות אימייל</h1>

      {status === "loading" && <p className="text-v2-text-secondary">מאמת...</p>}

      {message && (
        <p
          className={
            status === "error" ? "text-error" : "text-v2-text-secondary"
          }
        >
          {message}
        </p>
      )}

      {status === "success" && (
        <ButtonV2 variant="signal" href="/login">
          המשך להתחברות
        </ButtonV2>
      )}

      {email && status !== "success" && (
        <ButtonV2 variant="secondary" className="w-full" onClick={resend}>
          שלח שוב מייל אימות
        </ButtonV2>
      )}

      <Link href="/login" className="block text-sm text-v2-signal">
        חזרה להתחברות
      </Link>
    </Surface>
  );
}

export function VerifyEmailPage() {
  return (
    <Suspense fallback={<p className="text-center text-v2-text-muted">טוען...</p>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
