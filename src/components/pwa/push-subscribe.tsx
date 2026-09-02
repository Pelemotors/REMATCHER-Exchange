"use client";

import { useSession } from "next-auth/react";
import { PushSettings } from "@/components/pwa/push-settings";

/** @deprecated Prefer PushSettings — kept for existing imports */
export function PushSubscribeButton() {
  const { data: session } = useSession();
  return <PushSettings userId={session?.user?.id} />;
}

export { PushSettings } from "@/components/pwa/push-settings";
