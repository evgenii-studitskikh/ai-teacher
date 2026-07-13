// lib/passcode.test.ts
import { describe, expect, it } from "vitest";
import { isPasscodeCorrect } from "./passcode";

describe("isPasscodeCorrect", () => {
  it("accepts the right passcode", () => {
    expect(isPasscodeCorrect("hunter2", "hunter2")).toBe(true);
  });

  it("rejects the wrong passcode", () => {
    expect(isPasscodeCorrect("nope", "hunter2")).toBe(false);
  });

  // The whole app is behind this. If APP_PASSCODE is missing from the Vercel
  // environment, the app must be UNUSABLE, not WIDE OPEN. Failing open here
  // would hand a stranger the owner's ElevenLabs and Anthropic bills.
  it("denies everything when no passcode is configured", () => {
    expect(isPasscodeCorrect("", undefined)).toBe(false);
    expect(isPasscodeCorrect("anything", undefined)).toBe(false);
    expect(isPasscodeCorrect("", "")).toBe(false);
    expect(isPasscodeCorrect("anything", "")).toBe(false);
  });

  it("rejects a prefix of the passcode", () => {
    expect(isPasscodeCorrect("hunter", "hunter2")).toBe(false);
  });
});
