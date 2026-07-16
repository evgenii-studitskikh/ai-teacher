import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { buildAsrKeywords } from "../../../lib/asr";

// Was a bare GET that only minted a signed URL. Now a POST that receives the
// SessionConfig and, before minting, re-tunes the agent's ASR for a child
// speaker: scribe_realtime at high quality, keyword biasing toward the names
// this session will repeat constantly, and patient turn-taking (children
// pause mid-sentence; retranscribeOnTurnTimeout stops the ASR committing a
// half-heard turn). See docs/superpowers/specs/2026-07-16-asr-tuning-design.md.
//
// Read-modify-write, not a bare PATCH of {asr, turn}: the PATCH endpoint's
// merge depth for nested conversation_config objects is undocumented, and a
// shallow replace would silently wipe the agent's prompt/TTS/language config.
// Fetching the current config and writing it back with only asr/turn replaced
// is deterministic regardless of the API's merge semantics.
//
// Tuning is best-effort by design: a session running on stale ASR settings
// beats a child staring at an error, so every failure in the tuning path is
// logged and swallowed. Only a missing env config (nothing would work) is an
// error response.
export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    return Response.json(
      { error: "ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID must be set in .env.local" },
      { status: 500 },
    );
  }

  // The body is our own SessionView's JSON, but parse defensively: a bad body
  // must never block a session, it just means no keyword biasing this time.
  let config: unknown = null;
  try {
    config = await req.json();
  } catch {
    // fall through with config = null → buildAsrKeywords returns []
  }

  const client = new ElevenLabsClient({ apiKey });

  try {
    const { conversationConfig } = await client.conversationalAi.agents.get(agentId);
    await client.conversationalAi.agents.update(agentId, {
      conversationConfig: {
        ...conversationConfig,
        asr: {
          ...conversationConfig.asr,
          provider: "scribe_realtime",
          quality: "high",
          keywords: buildAsrKeywords(config),
        },
        turn: {
          ...conversationConfig.turn,
          turnEagerness: "patient",
          retranscribeOnTurnTimeout: true,
        },
      },
    });
  } catch (err) {
    console.warn("ASR tuning failed; starting session with the agent's existing config", err);
  }

  const { signedUrl } = await client.conversationalAi.conversations.getSignedUrl({ agentId });
  return Response.json({ signedUrl });
}
