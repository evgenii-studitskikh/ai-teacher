import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ToyInfo } from "../../../lib/types";

// Stateless, like the summarize route: a base64 photo in, a toy persona out,
// nothing touched on disk. The passcode proxy (proxy.ts) already gates this.
type IdentifyRequest = { image?: unknown; mediaType?: unknown };

const ToyIdentificationSchema = z.object({
  // The model reports whether it actually saw a toy. A photo of a wall or a
  // hand is not a toy; we surface that to the parent rather than inventing one.
  recognized: z.boolean(),
  toy: z
    .object({
      name: z.string(),
      character: z.string(),
      personality: z.string(),
      howToPlay: z.string(),
    })
    .nullable(),
});

export async function POST(request: Request) {
  let body: IdentifyRequest;
  try {
    body = (await request.json()) as IdentifyRequest;
  } catch {
    return Response.json({ toy: null, error: "Malformed request body" }, { status: 400 });
  }

  const image = typeof body.image === "string" ? body.image : "";
  if (!image) {
    return Response.json({ toy: null, error: "No image provided" }, { status: 400 });
  }
  const mediaType = body.mediaType === "image/png" ? "image/png" : "image/jpeg";

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ toy: null, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 1000,
      output_config: { format: zodOutputFormat(ToyIdentificationSchema) },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            {
              type: "text",
              text: `A parent has photographed a physical toy so their young child can play with it, voiced by an AI.

Identify the toy in this photo and build a warm, child-safe persona for it.

- name: what the toy is / the character it depicts, as it would introduce itself
  out loud to a child (e.g. "Buzz Lightyear", "the fluffy brown teddy bear").
- character: one short phrase describing what it is.
- personality: a few friendly, age-appropriate traits.
- howToPlay: grounded, concrete ideas for imaginative play with THIS toy.

If the photo does not clearly show a toy, set recognized to false and toy to null.
Keep everything gentle and suitable for a young child. Never invent scary,
violent, or adult themes even if the toy could suggest them.`,
            },
          ],
        },
      ],
    });

    const result = response.parsed_output;
    if (!result) {
      return Response.json({ toy: null, error: "Could not read the photo" }, { status: 502 });
    }
    // Not an error — the model looked and there was no toy. 200 with toy:null so
    // the client can show "couldn't spot a toy" rather than a failure.
    if (!result.recognized || !result.toy) {
      return Response.json({ toy: null });
    }
    return Response.json({ toy: result.toy as ToyInfo });
  } catch (e) {
    return Response.json(
      { toy: null, error: e instanceof Error ? e.message : "Identification failed" },
      { status: 502 },
    );
  }
}
