"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ButtonV2 } from "@/components/ui/brand-v2";
import { getPostAuthRedirect } from "@/lib/auth-routing";
import { getSession } from "next-auth/react";

async function nativeIdToken(
  provider: "apple" | "google"
): Promise<{ idToken: string; nonce?: string; name?: string } | null> {
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const Social = registerPlugin<{
      signIn: (opts: { provider: string }) => Promise<{
        idToken: string;
        nonce?: string;
        name?: string;
      }>;
    }>("SocialLogin");
    return await Social.signIn({ provider });
  } catch {
    return null;
  }
}

export function OAuthButtons({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"apple" | "google" | null>(null);

  async function complete(provider: "apple" | "google") {
    setError("");
    setBusy(provider);
    try {
      const native = await nativeIdToken(provider);
      if (!native?.idToken) {
        setError(
          provider === "apple"
            ? "Sign in with Apple זמין באפליקציית iOS לאחר הגדרת Owner."
            : "Google Sign-In זמין באפליקציית Android לאחר הגדרת Owner."
        );
        return;
      }
      const res = await fetch(`/api/auth/${provider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: native.idToken,
          nonce: native.nonce,
          name: native.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "ההתחברות נכשלה");
        return;
      }
      const signed = await signIn("credentials", {
        bridgeToken: data.bridgeToken,
        redirect: false,
      });
      if (signed?.error) {
        setError("לא הצלחנו לפתוח סשן");
        return;
      }
      const session = await getSession();
      const destination = session?.user
        ? getPostAuthRedirect(session.user, callbackUrl)
        : "/home";
      router.replace(destination);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      {error ? (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}
      <ButtonV2
        type="button"
        variant="secondary"
        className="w-full"
        disabled={Boolean(busy)}
        onClick={() => void complete("apple")}
      >
        {busy === "apple" ? "מתחבר…" : "המשך עם Apple"}
      </ButtonV2>
      <ButtonV2
        type="button"
        variant="secondary"
        className="w-full"
        disabled={Boolean(busy)}
        onClick={() => void complete("google")}
      >
        {busy === "google" ? "מתחבר…" : "המשך עם Google"}
      </ButtonV2>
      <p className="text-center text-xs text-v2-text-muted">
        {mode === "signup" ? "או מלא פרטים למטה" : "או התחבר באימייל"}
      </p>
    </div>
  );
}
