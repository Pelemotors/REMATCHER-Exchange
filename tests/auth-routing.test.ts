import { describe, it, expect } from "vitest";
import { getPostAuthRedirect, canAccessExchange } from "@/lib/auth-routing";

describe("auth-routing", () => {
  it("redirects unverified email to verify page", () => {
    expect(
      getPostAuthRedirect({
        dealerId: "d1",
        emailVerifiedAt: null,
        verificationStatus: "PENDING",
      })
    ).toBe("/verify-email");
  });

  it("redirects pending dealer to pending-approval", () => {
    expect(
      getPostAuthRedirect({
        dealerId: "d1",
        emailVerifiedAt: new Date().toISOString(),
        verificationStatus: "PENDING",
      })
    ).toBe("/pending-approval");
  });

  it("redirects verified dealer to home", () => {
    expect(
      getPostAuthRedirect({
        dealerId: "d1",
        emailVerifiedAt: new Date().toISOString(),
        verificationStatus: "VERIFIED",
      })
    ).toBe("/home");
  });

  it("respects callbackUrl when safe", () => {
    expect(
      getPostAuthRedirect(
        {
          dealerId: "d1",
          emailVerifiedAt: new Date().toISOString(),
          verificationStatus: "VERIFIED",
        },
        "/admin/dealers/abc"
      )
    ).toBe("/admin/dealers/abc");
  });

  it("canAccessExchange requires verified dealer", () => {
    expect(
      canAccessExchange({
        dealerId: "d1",
        emailVerifiedAt: new Date().toISOString(),
        verificationStatus: "VERIFIED",
      })
    ).toBe(true);
    expect(
      canAccessExchange({
        dealerId: "d1",
        emailVerifiedAt: new Date().toISOString(),
        verificationStatus: "PENDING",
      })
    ).toBe(false);
  });
});

import { compareDemands } from "@/services/demand/duplicate-detection";

describe("duplicate detection unchanged", () => {
  it("still works", () => {
    const result = compareDemands(
      { make: "Toyota", model: "Corolla", yearMin: 2021 },
      { make: "Mazda", model: "CX-5", yearMin: 2022 }
    );
    expect(result.level).toBe("DIFFERENT");
  });
});
