// app/api/summarize/route.test.ts
//
// The route is stateless: it takes a transcript and returns a summary, and
// touches no disk. These cover the two failure modes that must still come
// back as JSON rather than an unhandled exception — a malformed request body,
// and a missing ANTHROPIC_API_KEY (which stands in for any Claude-side
// failure, deterministically and without a network call). Both used to sit
// outside the route's try block before Finding 2's fix; on the client,
// res.json() on a non-JSON 500 throws, `setLoading(false)` never runs, and
// the parent is stuck on "Writing the summary…" forever with no Retry.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST, buildSummaryPrompt } from "./route";
import type { SavedSession, SessionConfig, ToyInfo } from "../../../lib/types";

const config: SessionConfig = {
  agentName: "Robo",
  voiceId: "v1",
  childName: "TestKid",
  childAge: 5,
  language: "en",
  goal: "Count to 10",
  directives: "",
  minutes: 10,
};

const validSession: Omit<SavedSession, "summary"> = {
  config,
  transcript: [{ role: "child", text: "hi", at: 0 }],
  startedAt: "2026-03-01T09:00:00.000Z",
  endedAt: "2026-03-01T09:00:05.000Z",
};

function postRequest(body: string): Request {
  return new Request("http://localhost/api/summarize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

let realAnthropicKey: string | undefined;

beforeEach(() => {
  realAnthropicKey = process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  if (realAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = realAnthropicKey;
});

describe("POST /api/summarize — failure paths always return JSON", () => {
  it("returns a JSON error (not an unhandled exception) for a malformed body", async () => {
    const res = await POST(postRequest("not valid json"));

    expect(res.status).toBe(400);
    const data = (await res.json()) as { summary: unknown; error?: string };
    expect(data.summary).toBeNull();
    expect(typeof data.error).toBe("string");
  });

  it("returns a JSON error (not an unhandled exception) when Claude can't be called", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const res = await POST(postRequest(JSON.stringify(validSession)));

    expect(res.status).toBe(500);
    const data = (await res.json()) as { summary: unknown; error?: string };
    expect(data.summary).toBeNull();
    expect(typeof data.error).toBe("string");
  });
});

const toy: ToyInfo = {
  name: "Buzz Lightyear",
  character: "a brave space-ranger action figure",
  personality: "confident, heroic",
  howToPlay: "pretend space missions",
};

describe("buildSummaryPrompt framing", () => {
  it("frames a lesson summary when there is no toy", () => {
    const p = buildSummaryPrompt(validSession, "child: hi");
    expect(p).toContain("lesson");
    expect(p).not.toContain("Buzz Lightyear");
  });

  it("frames a play recap when the session has a toy", () => {
    const toySession = { ...validSession, config: { ...config, toy, toyMode: "pov" as const } };
    const p = buildSummaryPrompt(toySession, "child: hi");
    expect(p).toContain("Buzz Lightyear");
    expect(p).toMatch(/play|played/i);
  });

  it("tells Claude to write the summary in the session's language", () => {
    const ru = { ...validSession, config: { ...config, language: "ru" as const } };
    expect(buildSummaryPrompt(ru, "child: hi")).toContain("Russian");

    const ruToy = { ...ru, config: { ...ru.config, toy, toyMode: "pov" as const } };
    expect(buildSummaryPrompt(ruToy, "child: hi")).toContain("Russian");

    // And the default English session says English, so the instruction is
    // always present rather than only for "foreign" languages.
    expect(buildSummaryPrompt(validSession, "child: hi")).toContain("English");
  });
});
