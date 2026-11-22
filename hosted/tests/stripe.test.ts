import { describe, it, expect } from "vitest";
import {
  resolveAmount,
  createCheckoutSession,
  type StripeCheckoutClient,
  type CheckoutParams,
} from "../src/stripe.js";

const fakeClient = (): { client: StripeCheckoutClient; calls: CheckoutParams[] } => {
  const calls: CheckoutParams[] = [];
  return {
    calls,
    client: {
      async createSession(params) {
        calls.push(params);
        return { url: "https://checkout.stripe.com/c/pay/fake" };
      },
    },
  };
};

describe("support amount allowlist", () => {
  it("resolves exact donation and credit choices", () => {
    expect(resolveAmount("donation", "small")).toEqual({ amountCents: 200, creditMicros: 0 });
    expect(resolveAmount("donation", "medium")).toEqual({ amountCents: 500, creditMicros: 0 });
    expect(resolveAmount("donation", "large")).toEqual({ amountCents: 1000, creditMicros: 0 });
    expect(resolveAmount("credits", "small")).toEqual({ amountCents: 500, creditMicros: 5_000_000 });
    expect(resolveAmount("credits", "medium")).toEqual({ amountCents: 1000, creditMicros: 10_000_000 });
    expect(resolveAmount("credits", "large")).toEqual({ amountCents: 2000, creditMicros: 20_000_000 });
  });

  it("rejects unknown kinds and choices", () => {
    expect(() => resolveAmount(" donation ", "small")).toThrow();
    expect(() => resolveAmount("donation", "huge")).toThrow();
    expect(() => resolveAmount("credits", "")).toThrow();
  });
});

describe("createCheckoutSession", () => {
  it("builds a hosted payment session and returns only the URL", async () => {
    const { client, calls } = fakeClient();
    const result = await createCheckoutSession(
      {
        kind: "credits",
        choice: "medium",
        walletId: "wallet-abc",
        origin: "https://studyai.example",
        integrationIdentifier: "studyai-abcdefgh",
      },
      client,
    );
    expect(result.url).toBe("https://checkout.stripe.com/c/pay/fake");
    expect(calls).toHaveLength(1);
    const params = calls[0];
    expect(params.mode).toBe("payment");
    expect(params.currency).toBe("usd");
    expect(params.clientReferenceId).toBe("wallet-abc");
    expect(params.metadata).toEqual({ kind: "credits", credit_micros: "10000000" });
    expect(params.integrationIdentifier).toBe("studyai-abcdefgh");
    expect(params.successUrl).toContain("https://studyai.example");
    expect(params.cancelUrl).toContain("https://studyai.example");
    expect(params.automaticTax).toBe(true);
    expect(params.taxCode).toBe("txcd_10103000");
    expect(params.taxBehavior).toBe("exclusive");
    expect(params.amountCents).toBe(1000);
    expect(Object.keys(params)).not.toContain("paymentMethodTypes");
  });

  it("does not enable automatic tax for donations", async () => {
    const { client, calls } = fakeClient();
    await createCheckoutSession(
      {
        kind: "donation",
        choice: "small",
        walletId: "wallet-abc",
        origin: "https://studyai.example",
        integrationIdentifier: "studyai-abcdefgh",
      },
      client,
    );
    expect(calls[0].automaticTax).toBe(false);
    expect(calls[0].creditMicros).toBe(0);
  });
});
