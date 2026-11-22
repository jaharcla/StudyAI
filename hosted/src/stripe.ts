import Stripe from "stripe";

export type SupportKind = "donation" | "credits";
export type Amount = { amountCents: number; creditMicros: number };

const DONATION_CENTS: Record<string, number> = { small: 200, medium: 500, large: 1000 };
const CREDIT_CENTS: Record<string, number> = { small: 500, medium: 1000, large: 2000 };
export const CREDIT_TAX_CODE = "txcd_10103000";

export function resolveAmount(kind: string, choice: string): Amount {
  if (kind !== "donation" && kind !== "credits") throw new Error(`Unknown support kind: ${kind}`);
  const table = kind === "donation" ? DONATION_CENTS : CREDIT_CENTS;
  const amountCents = table[choice];
  if (amountCents === undefined) throw new Error(`Unknown amount choice: ${choice}`);
  return { amountCents, creditMicros: kind === "credits" ? amountCents * 10_000 : 0 };
}

export interface CheckoutParams {
  mode: "payment";
  currency: "usd";
  amountCents: number;
  creditMicros: number;
  clientReferenceId: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  automaticTax: boolean;
  taxCode?: string;
  taxBehavior?: "exclusive" | "inclusive";
  integrationIdentifier: string;
}

export interface StripeCheckoutClient {
  createSession(params: CheckoutParams): Promise<{ url: string }>;
}

export interface CreateCheckoutInput {
  kind: SupportKind;
  choice: string;
  walletId: string;
  origin: string;
  integrationIdentifier: string;
}

export async function createCheckoutSession(
  input: CreateCheckoutInput,
  client: StripeCheckoutClient,
): Promise<{ url: string }> {
  const amount = resolveAmount(input.kind, input.choice);
  const params: CheckoutParams = {
    mode: "payment",
    currency: "usd",
    amountCents: amount.amountCents,
    creditMicros: amount.creditMicros,
    clientReferenceId: input.walletId,
    metadata: { kind: input.kind, credit_micros: String(amount.creditMicros) },
    successUrl: `${input.origin}/?checkout=success`,
    cancelUrl: `${input.origin}/?checkout=cancel`,
    automaticTax: input.kind === "credits",
    taxCode: input.kind === "credits" ? CREDIT_TAX_CODE : undefined,
    taxBehavior: input.kind === "credits" ? "exclusive" : undefined,
    integrationIdentifier: input.integrationIdentifier,
  };
  return client.createSession(params);
}

/** Real Stripe adapter for Cloudflare Workers: Web Crypto + fetch, no Node http module. */
export function createStripeCheckoutClient(secretKey: string): StripeCheckoutClient {
  const stripe = new Stripe(secretKey, {
    apiVersion: "2026-11-18.endive",
    httpClient: Stripe.createFetchHttpClient(),
    typescript: true,
  });
  return {
    async createSession(params) {
      const session = await stripe.checkout.sessions.create({
        mode: params.mode,
        line_items: [
          {
            price_data: {
              currency: params.currency,
              unit_amount: params.amountCents,
              tax_behavior: params.taxBehavior ?? "exclusive",
              product_data: {
                name: params.metadata.kind === "credits" ? "StudyAI credits" : "Support StudyAI",
                tax_code: params.taxCode,
              },
            },
            quantity: 1,
          },
        ],
        client_reference_id: params.clientReferenceId,
        metadata: params.metadata,
        automatic_tax: { enabled: params.automaticTax },
        integration_identifier: params.integrationIdentifier,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
      });
      if (!session.url) throw new Error("Stripe Checkout session has no URL");
      return { url: session.url };
    },
  };
}
