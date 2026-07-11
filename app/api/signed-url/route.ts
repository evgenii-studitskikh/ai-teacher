import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    return Response.json(
      { error: "ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID must be set in .env.local" },
      { status: 500 },
    );
  }

  const client = new ElevenLabsClient({ apiKey });
  const { signedUrl } = await client.conversationalAi.conversations.getSignedUrl({ agentId });
  return Response.json({ signedUrl });
}
