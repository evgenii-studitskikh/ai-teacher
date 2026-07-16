// app/api/signed-url/route.test.ts
//
// The route does three things before handing the client its signed URL:
// read the agent's current config, write it back with tuned ASR + turn
// settings (read-modify-write so the PATCH can't wipe unrelated agent
// config regardless of the API's merge depth), then mint the URL. The
// tests pin the two properties that matter: the PATCH payload is the old
// config with only asr/turn replaced, and NO failure in the tuning path
// may prevent a session from starting.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted because vi.mock factories are hoisted above const declarations —
// plain top-level vi.fn() consts risk a TDZ ReferenceError inside the factory.
const { get, update, getSignedUrl } = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  getSignedUrl: vi.fn(),
}));

vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: class {
    conversationalAi = {
      agents: { get, update },
      conversations: { getSignedUrl },
    };
  },
}));

import { POST } from "./route";

function postRequest(body: string): Request {
  return new Request("http://localhost/api/signed-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const config = { childName: "Mia", agentName: "Robo" };

let realEnv: { key?: string; agent?: string };
beforeEach(() => {
  realEnv = { key: process.env.ELEVENLABS_API_KEY, agent: process.env.ELEVENLABS_AGENT_ID };
  process.env.ELEVENLABS_API_KEY = "test-key";
  process.env.ELEVENLABS_AGENT_ID = "agent-1";
  vi.clearAllMocks();
  get.mockResolvedValue({
    conversationConfig: {
      agent: { firstMessage: "untouched" },
      tts: { voiceId: "untouched" },
      asr: { userInputAudioFormat: "pcm_16000" },
      turn: { turnTimeout: 7 },
    },
  });
  update.mockResolvedValue({});
  getSignedUrl.mockResolvedValue({ signedUrl: "wss://signed" });
});
afterEach(() => {
  if (realEnv.key === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = realEnv.key;
  if (realEnv.agent === undefined) delete process.env.ELEVENLABS_AGENT_ID;
  else process.env.ELEVENLABS_AGENT_ID = realEnv.agent;
});

describe("POST /api/signed-url", () => {
  it("PATCHes tuned ASR + turn settings merged over the current config", async () => {
    const res = await POST(postRequest(JSON.stringify(config)));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith("agent-1", {
      conversationConfig: {
        agent: { firstMessage: "untouched" }, // read-modify-write keeps this
        tts: { voiceId: "untouched" },
        asr: {
          userInputAudioFormat: "pcm_16000", // existing asr fields survive
          provider: "scribe_realtime",
          quality: "high",
          keywords: ["Mia", "Robo"],
        },
        turn: {
          turnTimeout: 7, // existing turn fields survive
          turnEagerness: "patient",
          retranscribeOnTurnTimeout: true,
        },
      },
    });
    expect((await res.json()).signedUrl).toBe("wss://signed");
  });

  it("still returns a signed URL when the tuning PATCH fails", async () => {
    update.mockRejectedValue(new Error("elevenlabs down"));
    const res = await POST(postRequest(JSON.stringify(config)));
    expect(res.status).toBe(200);
    expect((await res.json()).signedUrl).toBe("wss://signed");
  });

  it("still returns a signed URL when reading the agent config fails", async () => {
    get.mockRejectedValue(new Error("elevenlabs down"));
    const res = await POST(postRequest(JSON.stringify(config)));
    expect(res.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
    expect((await res.json()).signedUrl).toBe("wss://signed");
  });

  it("still returns a signed URL for a malformed body (keywords just stay empty)", async () => {
    const res = await POST(postRequest("not json"));
    expect(res.status).toBe(200);
    const patched = update.mock.calls[0][1].conversationConfig;
    expect(patched.asr.keywords).toEqual([]);
    expect((await res.json()).signedUrl).toBe("wss://signed");
  });

  it("returns a JSON 500 when env vars are missing", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const res = await POST(postRequest(JSON.stringify(config)));
    expect(res.status).toBe(500);
    expect(typeof (await res.json()).error).toBe("string");
  });
});
