import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { saveSession } from "../../../lib/storage";
import type { SavedSession, SessionSummary } from "../../../lib/types";

const SummarySchema = z.object({
  whatWeDid: z.string(),
  grasped: z.array(z.string()),
  struggled: z.array(z.string()),
  nextFocus: z.string(),
  engagement: z.enum(["low", "medium", "high"]),
  transcriptQuality: z.enum(["good", "poor"]),
});

export async function POST(request: Request) {
  const session = (await request.json()) as Omit<SavedSession, "summary">;

  // Write first. A summary failure must never cost us the session.
  await saveSession({ ...session, summary: null });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ summary: null, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const lines = session.transcript
    .map((t) => `${t.role === "agent" ? session.config.agentName : session.config.childName}: ${t.text}`)
    .join("\n");

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      output_config: { format: zodOutputFormat(SummarySchema) },
      messages: [
        {
          role: "user",
          content: `You are helping a parent understand how their child's lesson went.

The child is ${session.config.childName}, aged ${session.config.childAge}.
The goal of the session was: ${session.config.goal}
The teacher agent is called ${session.config.agentName}.

Here is the transcript:

${lines || "(the child said nothing)"}

Write a short, honest summary for the parent.

Be specific about what she grasped and what she struggled with — "counts 1 to 5
confidently", not "did well". If she lost interest, say when.

For transcriptQuality, judge whether the child's turns look like real speech that
was understood correctly, or like garbled nonsense. If speech recognition clearly
failed to understand her, mark it "poor" — this is how the parent finds out.`,
        },
      ],
    });

    const summary = response.parsed_output as SessionSummary | null;
    if (!summary) return Response.json({ summary: null, error: "Could not parse the summary" }, { status: 502 });

    await saveSession({ ...session, summary });
    return Response.json({ summary });
  } catch (e) {
    return Response.json(
      { summary: null, error: e instanceof Error ? e.message : "Summary failed" },
      { status: 502 },
    );
  }
}
