// Generates a custom ElevenLabs voice from a toy's description and saves it to
// the account. Stateless like every other route; explicitly opt-in from the UI
// because it costs credits and consumes an account voice slot. Two upstream
// calls: design (returns previews) then create (persists the first preview).
type DesignRequest = { name?: unknown; description?: unknown };

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return Response.json({ error: "ELEVENLABS_API_KEY not set" }, { status: 500 });

  let body: DesignRequest;
  try {
    body = (await request.json()) as DesignRequest;
  } catch {
    return Response.json({ error: "Malformed request body" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!name || description.length < 20) {
    return Response.json({ error: "A name and a description of at least 20 characters are required" }, { status: 400 });
  }

  const headers = { "xi-api-key": apiKey, "content-type": "application/json" };

  const designRes = await fetch("https://api.elevenlabs.io/v1/text-to-voice/design", {
    method: "POST",
    headers,
    body: JSON.stringify({ voice_description: description, auto_generate_text: true }),
  });
  if (!designRes.ok) {
    const detail = await designRes.text().catch(() => "");
    return Response.json({ error: `Voice design failed (HTTP ${designRes.status}). ${detail}`.trim() }, { status: 502 });
  }
  const design = (await designRes.json()) as { previews?: { generated_voice_id: string }[] };
  const generatedVoiceId = design.previews?.[0]?.generated_voice_id;
  if (!generatedVoiceId) {
    return Response.json({ error: "Voice design returned no previews" }, { status: 502 });
  }

  const createRes = await fetch("https://api.elevenlabs.io/v1/text-to-voice/create", {
    method: "POST",
    headers,
    body: JSON.stringify({
      voice_name: name,
      voice_description: description,
      generated_voice_id: generatedVoiceId,
    }),
  });
  if (!createRes.ok) {
    // The most common failure here is the account's voice-slot limit — the
    // upstream message says so; pass it through rather than paraphrasing.
    const detail = await createRes.text().catch(() => "");
    return Response.json({ error: `Voice creation failed (HTTP ${createRes.status}). ${detail}`.trim() }, { status: 502 });
  }
  const created = (await createRes.json()) as { voice_id?: string };
  if (!created.voice_id) {
    return Response.json({ error: "Voice creation returned no voice id" }, { status: 502 });
  }
  return Response.json({ voiceId: created.voice_id });
}
