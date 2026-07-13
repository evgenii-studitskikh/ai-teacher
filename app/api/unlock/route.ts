import { isPasscodeCorrect } from "../../../lib/passcode";

export async function POST(request: Request) {
  const { passcode } = (await request.json().catch(() => ({}))) as { passcode?: string };

  if (!isPasscodeCorrect(passcode ?? "", process.env.APP_PASSCODE)) {
    return Response.json({ error: "That is not the passcode." }, { status: 401 });
  }

  const response = Response.json({ ok: true });
  response.headers.append(
    "Set-Cookie",
    [
      `ai-teacher-unlocked=${encodeURIComponent(process.env.APP_PASSCODE as string)}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      `Max-Age=${60 * 60 * 24 * 30}`,
    ].join("; "),
  );
  return response;
}
