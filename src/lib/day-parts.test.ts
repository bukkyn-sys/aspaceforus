import { describe, it, expect } from "vitest";
import { partsLabel, fmtTimeLabel, PARTS, type DayPart } from "./day-parts";

describe("partsLabel", () => {
  it("renders all four parts as 'all day'", () => {
    expect(partsLabel([...PARTS])).toBe("all day");
  });
  it("orders parts canonically regardless of input order", () => {
    expect(partsLabel(["evening", "morning"] as DayPart[])).toBe("morning · evening");
  });
  it("renders a single part", () => {
    expect(partsLabel(["afternoon"] as DayPart[])).toBe("afternoon");
  });
});

describe("fmtTimeLabel", () => {
  it("formats 24h times to am/pm", () => {
    expect(fmtTimeLabel("09:00")).toBe("9am");
    expect(fmtTimeLabel("13:30")).toBe("1:30pm");
    expect(fmtTimeLabel("00:00")).toBe("12am");
    expect(fmtTimeLabel("12:00")).toBe("12pm");
    expect(fmtTimeLabel("23:05")).toBe("11:05pm");
  });
});
