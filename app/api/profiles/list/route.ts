import { listProfiles } from "../../../../lib/storage";

export async function GET() {
  return Response.json({ profiles: await listProfiles() });
}
