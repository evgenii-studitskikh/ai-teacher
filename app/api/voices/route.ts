export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return Response.json({ error: "ELEVENLABS_API_KEY not set" }, { status: 500 });

  const res = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) return Response.json({ error: "Could not list voices" }, { status: 502 });

  const data = (await res.json()) as {
    voices: { voice_id: string; name: string; preview_url: string }[];
  };
  return Response.json({
    voices: data.voices.map((v) => ({
      voiceId: v.voice_id,
      name: v.name,
      previewUrl: v.preview_url,
    })),
  });
}
