import { describe, expect, it } from "vitest";
import { fitWithin } from "./image";

describe("fitWithin", () => {
  it("leaves an already-small image untouched", () => {
    expect(fitWithin(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });

  it("scales a large landscape image down to the max longest side", () => {
    expect(fitWithin(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 });
  });

  it("scales a large portrait image down to the max longest side", () => {
    expect(fitWithin(3000, 4000, 1024)).toEqual({ width: 768, height: 1024 });
  });

  it("handles a square image", () => {
    expect(fitWithin(2048, 2048, 1024)).toEqual({ width: 1024, height: 1024 });
  });
});
