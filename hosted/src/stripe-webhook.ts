import Stripe from "stripe";
import { creditWallet, type LedgerStore } from "./ledger.js";

export type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: {
      payment_status?: string;
      client_reference_id?: string | null;
      metadata?: Record<string, string>;
    };
  };
};

export interface StripeEventStore {
  hasEvent(id: string): Promise<boolean>;
  recordEvent(id: string, kind: string, createdAt: string): Promise<void>;
}

export interface WebhookEnv {
  STRIPE_WEBHOOK_SECRET: string;
  store: LedgerStore;
  events: StripeEventStore;
}

type ConstructEvent = (body: string, signature: string, secret: string) => StripeEvent | Promise<StripeEvent>;

const CREDIT_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Real Stripe signature verifier for Workers: subtle crypto, not Node crypto. */
export async function verifyStripeSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<StripeEvent> {
  const event = await Stripe.webhooks.constructEventAsync(
    body,
    signature,
    secret,
    undefined,
    Stripe.createSubtleCryptoProvider(),
  );
  const data = event.data.object;
  const paymentStatus = "payment_status" in data && typeof data.payment_status === "string" ? data.payment_status : undefined;
  const clientReferenceId = "client_reference_id" in data && typeof data.client_reference_id === "string" ? data.client_reference_id : undefined;
  const metadata: Record<string, string> = {};
  if ("metadata" in data && data.metadata && typeof data.metadata === "object") {
    for (const [key, value] of Object.entries(data.metadata)) {
      if (typeof value === "string") metadata[key] = value;
    }
  }
  return { id: event.id, type: event.type, data: { object: { payment_status: paymentStatus, client_reference_id: clientReferenceId, metadata } } };
}

export async function handleStripeWebhook(
  request: Request,
  env: WebhookEnv,
  constructEvent: ConstructEvent,
): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  let event: StripeEvent;
  try {
    event = await constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return json(400, { error: "invalid_signature" });
  }

  if (await env.events.hasEvent(event.id)) return json(200, { received: true });

  const object = event.data.object;
  const metadata = object.metadata ?? {};
  if (CREDIT_EVENTS.has(event.type) && object.payment_status !== "unpaid" && metadata.kind === "credits" && object.client_reference_id) {
    const amountMicros = Number(metadata.credit_micros);
    if (Number.isInteger(amountMicros) && amountMicros > 0) {
      await creditWallet(object.client_reference_id, amountMicros, `stripe_event:${event.id}`, env.store);
    }
  }

  await env.events.recordEvent(event.id, metadata.kind ?? "unknown", new Date().toISOString());
  return json(200, { received: true });
}
