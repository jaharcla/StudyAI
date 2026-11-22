import { randomUUID } from "node:crypto";
import {
  createWallet,
  reserve,
  capture,
  release,
  getWallet,
  InsufficientCredits,
  PER_REQUEST_MAX_MICROS,
  type LedgerStore,
} from "./ledger.js";
import { callGroq, type ChatRequest } from "./groq.js";
import { costMicros } from "./pricing.js";
import { hashToken } from "./token.js";

export interface ChatEnv {
  GROQ_API_KEY: string;
  store: LedgerStore;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Authenticated, metered chat endpoint. The browser sends a wallet token, never a
 * provider key. A hold is placed before the upstream call and released on failure.
 */
export async function handleChat(
  request: Request,
  env: ChatEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([0-9a-f]{32,})$/i.exec(authorization.trim());
  if (!match) return json(401, { error: "invalid_wallet_token" });
  const walletToken = match[1].toLowerCase();

  let body: { model?: string; messages?: ChatRequest["messages"] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json(400, { error: "invalid_request" });
  }
  if (typeof body.model !== "string" || !Array.isArray(body.messages) || body.messages.length === 0) {
    return json(400, { error: "invalid_request" });
  }

  // Validate the model against the pinned price table before touching the wallet.
  try {
    costMicros(body.model, 0, 0);
  } catch {
    return json(400, { error: "unknown_model" });
  }

  const walletId = await hashToken(walletToken);
  await createWallet(walletId, env.store);

  const requestId = randomUUID();
  try {
    await reserve(walletId, PER_REQUEST_MAX_MICROS, requestId, env.store);
  } catch (error) {
    if (error instanceof InsufficientCredits) {
      return json(402, { error: "insufficient_credits" });
    }
    throw error;
  }

  let captured = false;
  try {
    const result = await callGroq(
      { model: body.model, messages: body.messages },
      env.GROQ_API_KEY,
      fetchImpl,
    );
    const cost = costMicros(body.model, result.promptTokens, result.completionTokens);
    await capture(requestId, cost, env.store);
    captured = true;
    const wallet = await getWallet(walletId, env.store);
    return json(200, { text: result.text, balanceMicros: wallet.balance_micros });
  } catch {
    if (!captured) await release(requestId, env.store);
    return json(502, { error: "upstream_error" });
  }
}
