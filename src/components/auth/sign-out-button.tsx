"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      התנתקות
    </button>
  );
}
