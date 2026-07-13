// lib/passcode.ts

// Constant-time comparison. A `===` on a secret leaks its length and, in
// principle, its prefix through timing. This is a family app behind a
// four-word passcode and the practical risk is small, but the cost of doing it
// right is four lines.
export function isPasscodeCorrect(submitted: string, expected: string | undefined): boolean {
  // No passcode configured means the app is misconfigured, and a misconfigured
  // app must FAIL CLOSED. If this returned true, deploying without setting
  // APP_PASSCODE would leave the owner's API keys open to anyone with the URL.
  if (!expected) return false;

  const a = new TextEncoder().encode(submitted);
  const b = new TextEncoder().encode(expected);
  // Lengths differing is itself a mismatch; compare anyway so the work done
  // does not depend on where the difference is.
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
