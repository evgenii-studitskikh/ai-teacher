import { loadProfile, saveProfile } from "../../../lib/storage";
import type { SessionConfig } from "../../../lib/types";

export async function GET(request: Request) {
  const childName = new URL(request.url).searchParams.get("childName");
  if (!childName) return Response.json({ config: null });
  return Response.json({ config: await loadProfile(childName) });
}

export async function POST(request: Request) {
  const config = (await request.json()) as SessionConfig;
  await saveProfile(config);
  return Response.json({ ok: true });
}
