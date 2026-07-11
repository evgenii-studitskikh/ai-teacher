import { loadLatestSummary } from "../../../lib/storage";

export async function GET(request: Request) {
  const childName = new URL(request.url).searchParams.get("childName");
  if (!childName) return Response.json({ summary: null });
  return Response.json({ summary: await loadLatestSummary(childName) });
}
