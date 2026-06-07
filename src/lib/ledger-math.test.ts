import { describe, it, expect } from "vitest";
import { netBalance, isSettled } from "./ledger-math";

const ME = "me";
const THEM = "them";

describe("netBalance", () => {
  it("is zero with no entries", () => {
    expect(netBalance([], ME)).toBe(0);
  });

  it("I paid, even split → they owe half (positive)", () => {
    expect(netBalance([{ amount: 100, split_ratio: 0.5, paid_by: ME }], ME)).toBeCloseTo(50);
  });

  it("they paid, even split → I owe half (negative)", () => {
    expect(netBalance([{ amount: 100, split_ratio: 0.5, paid_by: THEM }], ME)).toBeCloseTo(-50);
  });

  it("I paid, my share 0 → they owe the full amount", () => {
    expect(netBalance([{ amount: 80, split_ratio: 0, paid_by: ME }], ME)).toBeCloseTo(80);
  });

  it("they paid, my share 1 → I owe the full amount", () => {
    expect(netBalance([{ amount: 80, split_ratio: 1, paid_by: THEM }], ME)).toBeCloseTo(-80);
  });

  it("accepts string amounts/ratios and defaults a missing ratio to 0.5", () => {
    expect(netBalance([{ amount: "40", paid_by: ME }], ME)).toBeCloseTo(20);
    expect(netBalance([{ amount: "40", split_ratio: "0.25", paid_by: THEM }], ME)).toBeCloseTo(-10);
  });

  it("nets opposing entries", () => {
    const entries = [
      { amount: 100, split_ratio: 0.5, paid_by: ME },   // +50
      { amount: 60, split_ratio: 0.5, paid_by: THEM },  // -30
    ];
    expect(netBalance(entries, ME)).toBeCloseTo(20);
  });
});

describe("isSettled", () => {
  it("is true within a penny", () => {
    expect(isSettled(0)).toBe(true);
    expect(isSettled(0.004)).toBe(true);
    expect(isSettled(-0.004)).toBe(true);
  });
  it("is false otherwise", () => {
    expect(isSettled(0.5)).toBe(false);
  });
});
