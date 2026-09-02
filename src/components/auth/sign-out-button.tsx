"use client";

import { signOut } from "next-auth/react";
import { ButtonV2 } from "@/components/ui/brand-v2";

export function SignOutButton() {
  return (
    <ButtonV2
      variant="secondary"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      התנתקות
    </ButtonV2>
  );
}
