// proxy.ts  (repo root — Next.js will not find it anywhere else)
//
// Named `proxy`, not `middleware`: Next 16 deprecated the `middleware.ts`
// file convention in favour of `proxy.ts` (same signature, same execution
// point, renamed to avoid confusion with Express-style middleware). See
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "ai-teacher-unlocked";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The unlock screen and the route that checks the passcode must be reachable
  // without the passcode, or there is no way in.
  if (pathname === "/unlock" || pathname === "/api/unlock") return NextResponse.next();

  // `!!expected &&` is load-bearing, not decoration: without it, an unset
  // APP_PASSCODE (undefined) compared against a missing cookie (also
  // undefined) would satisfy `===` and unlock every stranger who sends no
  // cookie at all — the exact fail-OPEN this proxy exists to prevent.
  const expected = process.env.APP_PASSCODE;
  const unlocked = !!expected && request.cookies.get(COOKIE)?.value === expected;
  if (unlocked) return NextResponse.next();

  // An API caller gets a flat 401. Redirecting a fetch to an HTML login page
  // produces a confusing parse error rather than an honest refusal — and this
  // is the path a stranger's curl takes.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Locked." }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/unlock", request.url));
}

export const config = {
  // Everything except Next's own static assets and the favicon. Note this
  // deliberately DOES cover /api/* — those routes spend the owner's ElevenLabs
  // and Anthropic credits and are the whole reason this proxy exists.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
