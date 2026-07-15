// app/api/identify-toy/route.test.ts
//
// The route is stateless: base64 image in, ToyInfo (or null) out, no disk.
// These cover the failure modes that must come back as JSON rather than an
// unhandled exception — a malformed body, a missing image field, and a missing
// ANTHROPIC_API_KEY (which stands in for any Claude-side failure without a
// network call). Every path out of this route must be JSON.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "./route";

function postRequest(body: string): Request {
  return new Request("http://localhost/api/identify-toy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

let realKey: string | undefined;
beforeEach(() => {
  realKey = process.env.ANTHROPIC_API_KEY;
});
afterEach(() => {
  if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = realKey;
});

describe("POST /api/identify-toy — failure paths always return JSON", () => {
  it("returns a JSON 400 for a malformed body", async () => {
    const res = await POST(postRequest("not json"));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { toy: unknown; error?: string };
    expect(data.toy).toBeNull();
    expect(typeof data.error).toBe("string");
  });

  it("returns a JSON 400 when no image is provided", async () => {
    const res = await POST(postRequest(JSON.stringify({})));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { toy: unknown; error?: string };
    expect(data.toy).toBeNull();
    expect(typeof data.error).toBe("string");
  });

  it("returns a JSON 500 when Claude can't be called", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(postRequest(JSON.stringify({ image: "abc123" })));
    expect(res.status).toBe(500);
    const data = (await res.json()) as { toy: unknown; error?: string };
    expect(data.toy).toBeNull();
    expect(typeof data.error).toBe("string");
  });
});
