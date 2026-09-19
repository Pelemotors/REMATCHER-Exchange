import { describe, expect, it } from "vitest";
import { assertIsolatedFieldTestDatabase } from "@/services/testing/synthetic-e2e-harness";

describe("synthetic E2E harness isolation", () => {
  it("accepts Field Test URL and refuses production-shaped URLs", () => {
    expect(() =>
      assertIsolatedFieldTestDatabase(
        "postgresql://x:y@127.0.0.1:5435/rematcher_exchange_field_test"
      )
    ).not.toThrow();
    expect(() =>
      assertIsolatedFieldTestDatabase(
        "postgresql://x:y@127.0.0.1:5436/rematcher_exchange"
      )
    ).toThrow(/REFUSING/);
    expect(() =>
      assertIsolatedFieldTestDatabase(
        "postgresql://x:y@127.0.0.1:5432/rematcher_exchange"
      )
    ).toThrow(/REFUSING/);
  });
});
