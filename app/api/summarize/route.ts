import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { attachSummary, findSessionFile, saveSession } from "../../../lib/storage";
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
  let session: Omit<SavedSession, "summary">;
  try {
    session = (await request.json()) as Omit<SavedSession, "summary">;
  } catch {
    // Malformed body. This used to be outside every try block, so a bad
    // request produced an unhandled exception and a non-JSON 500 — which on
    // the client made res.json() throw and stranded the parent on "Writing
    // the summary…" forever. Every path out of this route must be JSON now.
    return Response.json({ summary: null, error: "Malformed request body" }, { status: 400 });
  }

  try {
    // Write first. A summary failure must never cost us the session. On a
    // Retry, the client has no session id to hand back — it just resends the
    // same session payload — so we look for a file that already holds this
    // exact session (findSessionFile matches on content) before creating a
    // new one. Either way `file` ends up durably on disk before we call
    // Claude, and a retry updates that same record instead of leaving an
    // orphaned summary:null sibling behind.
    //
    // This save step used to sit outside the try block too, so a storage
    // failure (e.g. EACCES) would throw past every handler here and hand the
    // client an unhandled 500 with no JSON body. It's now inside the same
    // try as the Claude call, so any failure on either side comes back as a
    // JSON error the client can actually parse and show a Retry for.
    const file = (await findSessionFile(session)) ?? (await saveSession({ ...session, summary: null }));

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ summary: null, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
    }

    const lines = session.transcript
      .map((t) => `${t.role === "agent" ? session.config.agentName : session.config.childName}: ${t.text}`)
      .join("\n");

    const client = new Anthropic({ apiKey });

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

Be specific about what ${session.config.childName} grasped and what they struggled
with — "counts 1 to 5 confidently", not "did well". If they lost interest, say when.

For transcriptQuality, judge whether the child's turns look like real speech that
was understood correctly, or like garbled nonsense. If speech recognition clearly
failed to understand them, mark it "poor" — this is how the parent finds out.`,
        },
      ],
    });

    const summary = response.parsed_output as SessionSummary | null;
    if (!summary) return Response.json({ summary: null, error: "Could not parse the summary" }, { status: 502 });

    await attachSummary(file, summary);
    return Response.json({ summary });
  } catch (e) {
    return Response.json(
      { summary: null, error: e instanceof Error ? e.message : "Summary failed" },
      { status: 502 },
    );
  }
}
