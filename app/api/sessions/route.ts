// POST /api/sessions — write a finished session's transcript to disk, with no
// summary yet, and return the path it was written to.
//
// This route exists because of the invariant the whole end-of-session flow
// rests on: **the transcript is durably on disk before anything else is
// attempted**. It used to be that the transcript's only disk write happened
// inside the summarize route — so if the client's fetch to that route never
// reached the server at all (dev server hot-reloading, laptop asleep, port
// gone: routine `next dev` life), nothing was written, and yet the UI told the
// parent "the transcript is saved" and offered a Done button that threw the
// session away. The parent was told a false thing and lost the lesson.
//
// Now the client saves first, here, and only summarizes once *this* route has
// answered with a real file path. If this route fails, the client says so
// loudly and offers a retry — never a Done button.
import { findSessionFile, saveSession } from "../../../lib/storage";
import type { SavedSession } from "../../../lib/types";

export async function POST(request: Request) {
  let session: Omit<SavedSession, "summary">;
  try {
    session = (await request.json()) as Omit<SavedSession, "summary">;
  } catch {
    return Response.json({ filePath: null, error: "Malformed request body" }, { status: 400 });
  }

  try {
    // findSessionFile first, so that a *retried* save (the write succeeded but
    // the response never made it back to the client, say) updates nothing and
    // returns the existing path rather than writing a second copy of the same
    // lesson. saveSession itself stays collision-safe for genuinely different
    // sessions that share an endedAt millisecond.
    const filePath = (await findSessionFile(session)) ?? (await saveSession({ ...session, summary: null }));
    return Response.json({ filePath });
  } catch (e) {
    return Response.json(
      { filePath: null, error: e instanceof Error ? e.message : "Could not save the transcript" },
      { status: 500 },
    );
  }
}
