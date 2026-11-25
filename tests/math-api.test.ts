import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { handleMathRequest } from "../server/math/http.js";

const json = (res: ServerResponse, status: number, data: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
};

const body = (req: IncomingMessage, limit = 1_000_000) =>
  new Promise<string>((resolveBody, reject) => {
    let value = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      value += chunk;
      if (value.length > limit) reject(new Error("payload too large"));
    });
    req.on("end", () => resolveBody(value));
    req.on("error", reject);
  });

const server = createServer((req, res) => {
  void handleMathRequest(req, res, json, body).then((handled) => {
    if (!handled) {
      res.writeHead(404);
      res.end();
    }
  });
});
let origin = "";
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address && typeof address !== "string") origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

const post = (payload: string) =>
  fetch(`${origin}/api/math/evaluate`, { method: "POST", headers: { "content-type": "application/json" }, body: payload });

describe("math API contract", () => {
  it("returns 200 for every valid operation", async () => {
    const cases = [
      { operation: "simplify", arguments: { expression: "1/2 + 1/3" } },
      { operation: "solve", arguments: { expression: "2x + 3 = 7" } },
      { operation: "check_equivalence", arguments: { left: "2+2", right: "4" } },
      { operation: "unit_convert", arguments: { value: 100, from: "cm", to: "m" } },
    ];
    for (const payload of cases) {
      const response = await post(JSON.stringify(payload));
      expect(response.status).toBe(200);
      const result = (await response.json()) as Record<string, unknown>;
      expect(result).toMatchObject({ status: "ok", computed: true, operation: payload.operation });
      expect(result).not.toHaveProperty("citation");
    }
  });

  it("carries an evaluator typed error at 200 without guessing", async () => {
    const response = await post(JSON.stringify({ operation: "simplify", arguments: { expression: "1/0" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "error", reason: expect.stringContaining("Division by zero") });
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await post("{not json");
    expect(response.status).toBe(400);
  });

  it("returns typed errors for an unknown operation and an unknown field", async () => {
    const unknownOperation = await post(JSON.stringify({ operation: "integrate", arguments: {} }));
    expect(unknownOperation.status).toBe(200);
    expect(await unknownOperation.json()).toMatchObject({ status: "error", reason: expect.any(String) });

    const unknownField = await post(JSON.stringify({ operation: "simplify", arguments: { expression: "1+1" }, surprise: true }));
    expect(unknownField.status).toBe(200);
    expect(await unknownField.json()).toMatchObject({ status: "error", reason: expect.any(String) });
  });

  it("returns a typed error for an oversized expression", async () => {
    const response = await post(JSON.stringify({ operation: "simplify", arguments: { expression: "1+".repeat(120) } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "error", reason: expect.stringContaining("length") });
  });

  it("ignores unrelated paths and methods", async () => {
    expect((await fetch(`${origin}/api/math/other`)).status).toBe(404);
    expect((await fetch(`${origin}/api/math/evaluate`)).status).toBe(404);
  });

  it("has no provider call, network egress or persistence in the route", async () => {
    const source = await readFile(new URL("../server/math/http.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from ["'].*(provider|db|models|fetch)/);
    expect(source).not.toContain("fetch(");
  });
});
