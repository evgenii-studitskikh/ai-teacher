import { describe, expect, it } from "vitest";
import { buildAsrKeywords } from "./asr";

describe("buildAsrKeywords", () => {
  it("returns child name, agent name and toy name", () => {
    expect(
      buildAsrKeywords({
        childName: "Mia",
        agentName: "Robo",
        toy: { name: "Buzz Lightyear" },
      }),
    ).toEqual(["Mia", "Robo", "Buzz Lightyear"]);
  });

  it("omits the toy entry when there is no toy", () => {
    expect(buildAsrKeywords({ childName: "Mia", agentName: "Robo" })).toEqual(["Mia", "Robo"]);
  });

  it("deduplicates — in POV toy mode the agent name IS the toy name", () => {
    expect(
      buildAsrKeywords({
        childName: "Mia",
        agentName: "Buzz Lightyear",
        toy: { name: "Buzz Lightyear" },
      }),
    ).toEqual(["Mia", "Buzz Lightyear"]);
  });

  it("drops blank and missing names", () => {
    expect(buildAsrKeywords({ childName: "  ", agentName: "Robo" })).toEqual(["Robo"]);
  });

  it("returns [] for junk input — the route feeds it untrusted JSON", () => {
    expect(buildAsrKeywords(null)).toEqual([]);
    expect(buildAsrKeywords("nonsense")).toEqual([]);
    expect(buildAsrKeywords({ childName: 42 })).toEqual([]);
  });
});
