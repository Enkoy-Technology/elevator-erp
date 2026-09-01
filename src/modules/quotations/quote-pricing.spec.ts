import { Decimal } from "decimal.js";

import {
  allocateToLines,
  computeDiscount,
  deriveFromGrandTotal,
} from "./quote-pricing";

const sum = (values: readonly string[]): string =>
  values.reduce((acc, v) => acc.plus(v), new Decimal(0)).toFixed(2);

describe("deriveFromGrandTotal", () => {
  it("reproduces the client's real proforma to the cent", () => {
    expect(deriveFromGrandTotal("7835000.00", "15.00")).toEqual({
      subtotalEtb: "6813043.48",
      taxAmountEtb: "1021956.52",
      totalEtb: "7835000.00",
    });
  });

  it("keeps subtotal + tax === total exactly, including non-terminating divisions", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["7835000.00", "15.00"],
      ["100.00", "15"],
      ["0.01", "15"],
      ["0.03", "15"],
      ["1000000.03", "7.5"],
      ["999999999.99", "33.333"],
      ["1.00", "3"],
      ["12345.67", "15"],
      ["0.02", "100"],
      ["500000.00", "0"],
    ];
    for (const [total, rate] of cases) {
      const result = deriveFromGrandTotal(total, rate);
      expect(sum([result.subtotalEtb, result.taxAmountEtb])).toBe(
        result.totalEtb,
      );
    }
  });

  it("rounds a non-terminating division half-up and takes the tax as the difference", () => {
    // 100 / 1.15 = 86.9565...  ->  86.96, and 100 - 86.96 = 13.04
    // (86.96 * 0.15 would be 13.044 -> 13.04 here but drifts elsewhere,
    //  which is exactly why tax is subtracted rather than recomputed).
    expect(deriveFromGrandTotal("100.00", "15")).toEqual({
      subtotalEtb: "86.96",
      taxAmountEtb: "13.04",
      totalEtb: "100.00",
    });
  });

  it("treats a 0% rate as no tax at all", () => {
    expect(deriveFromGrandTotal("7835000.00", "0")).toEqual({
      subtotalEtb: "7835000.00",
      taxAmountEtb: "0.00",
      totalEtb: "7835000.00",
    });
  });

  it("handles a zero grand total", () => {
    expect(deriveFromGrandTotal("0.00", "15.00")).toEqual({
      subtotalEtb: "0.00",
      taxAmountEtb: "0.00",
      totalEtb: "0.00",
    });
  });

  it("accepts an integer-formatted total and whitespace, and normalises the output to 2dp", () => {
    expect(deriveFromGrandTotal(" 7835000 ", " 15 ")).toEqual({
      subtotalEtb: "6813043.48",
      taxAmountEtb: "1021956.52",
      totalEtb: "7835000.00",
    });
  });

  it("rejects negative and non-numeric input", () => {
    expect(() => deriveFromGrandTotal("-1.00", "15")).toThrow(
      /grandTotalEtb must not be negative/,
    );
    expect(() => deriveFromGrandTotal("100.00", "-15")).toThrow(
      /taxPercent must not be negative/,
    );
    expect(() => deriveFromGrandTotal("not money", "15")).toThrow(
      /grandTotalEtb: not a valid decimal money string/,
    );
    // @ts-expect-error runtime guard: a nullable numeric column can hand us null
    expect(() => deriveFromGrandTotal(null, "15")).toThrow(/grandTotalEtb/);
  });
});

describe("allocateToLines", () => {
  it("gives a single line the whole target", () => {
    expect(allocateToLines(["7410000.00"], "6813043.48")).toEqual([
      "6813043.48",
    ]);
  });

  it("sums to the target exactly when the split does not divide evenly", () => {
    const allocated = allocateToLines(["100", "100", "100"], "1000.00");
    expect(sum(allocated)).toBe("1000.00");
    expect(allocated).toEqual(["333.34", "333.33", "333.33"]);
  });

  it("allocates pro-rata by list total, not equally", () => {
    expect(allocateToLines(["750.00", "250.00"], "1000.00")).toEqual([
      "750.00",
      "250.00",
    ]);
    expect(allocateToLines(["900.00", "100.00"], "500.00")).toEqual([
      "450.00",
      "50.00",
    ]);
  });

  it("handles a premium — a target above the list sum", () => {
    const allocated = allocateToLines(["100.00", "200.00"], "450.00");
    expect(allocated).toEqual(["150.00", "300.00"]);
    expect(sum(allocated)).toBe("450.00");
  });

  it("leaves a zero-value line at 0.00 and still sums to the target", () => {
    const allocated = allocateToLines(["100", "0", "100", "100"], "1000.00");
    expect(allocated[1]).toBe("0.00");
    expect(sum(allocated)).toBe("1000.00");
  });

  it("returns all zeros for a zero target", () => {
    expect(allocateToLines(["100", "200", "300"], "0.00")).toEqual([
      "0.00",
      "0.00",
      "0.00",
    ]);
  });

  it("handles all-zero lines with a zero target", () => {
    expect(allocateToLines(["0", "0.00", "0"], "0")).toEqual([
      "0.00",
      "0.00",
      "0.00",
    ]);
  });

  it("splits equally when every list total is zero but the target is not", () => {
    const allocated = allocateToLines(["0", "0", "0"], "10.00");
    expect(sum(allocated)).toBe("10.00");
    expect(allocated).toEqual(["3.34", "3.33", "3.33"]);
  });

  it("never loses or invents a cent across awkward splits", () => {
    const cases: ReadonlyArray<readonly [readonly string[], string]> = [
      [["1", "1", "1", "1", "1", "1", "1"], "0.01"],
      [["1", "1", "1"], "0.02"],
      [["3", "5", "7", "11"], "6813043.48"],
      [["0.01", "999999.99"], "123456.78"],
      [["1", "2", "3", "4", "5", "6", "7", "8", "9"], "100.00"],
      [["1000000", "1"], "999999.99"],
      [["1"], "0.00"],
    ];
    for (const [lines, target] of cases) {
      const allocated = allocateToLines(lines, target);
      expect(allocated).toHaveLength(lines.length);
      expect(sum(allocated)).toBe(new Decimal(target).toFixed(2));
    }
  });

  it("rejects an empty list, a negative target and a negative line", () => {
    expect(() => allocateToLines([], "100.00")).toThrow(
      /lineListTotalsEtb must not be empty/,
    );
    expect(() => allocateToLines(["100"], "-0.01")).toThrow(
      /targetSubtotalEtb must not be negative/,
    );
    expect(() => allocateToLines(["100", "-1"], "100.00")).toThrow(
      /lineListTotalsEtb\[1\] must not be negative/,
    );
    expect(() => allocateToLines(["100", "oops"], "100.00")).toThrow(
      /lineListTotalsEtb\[1\]: not a valid decimal money string/,
    );
  });
});

describe("computeDiscount", () => {
  it("records the client's real negotiated discount", () => {
    expect(computeDiscount("8521500.00", "7835000.00")).toEqual({
      discountAmountEtb: "686500.00",
      discountPercent: "8.06",
    });
  });

  it("reports a premium as a negative amount and percent, not an error", () => {
    expect(computeDiscount("1000.00", "1200.00")).toEqual({
      discountAmountEtb: "-200.00",
      discountPercent: "-20.00",
    });
  });

  it("reports no discount when the quote matches the formula", () => {
    expect(computeDiscount("8521500.00", "8521500.00")).toEqual({
      discountAmountEtb: "0.00",
      discountPercent: "0.00",
    });
  });

  it("does not divide by zero when the calculated total is zero", () => {
    expect(computeDiscount("0.00", "500.00")).toEqual({
      discountAmountEtb: "-500.00",
      discountPercent: "0.00",
    });
    expect(computeDiscount("0", "0")).toEqual({
      discountAmountEtb: "0.00",
      discountPercent: "0.00",
    });
  });

  it("rounds the percent half-up to 2dp", () => {
    // 1 / 3 * 100 = 33.333... -> 33.33
    expect(computeDiscount("3.00", "2.00").discountPercent).toBe("33.33");
    // 2 / 3 * 100 = 66.666... -> 66.67
    expect(computeDiscount("3.00", "1.00").discountPercent).toBe("66.67");
  });

  it("rejects negative and non-numeric input", () => {
    expect(() => computeDiscount("-1", "0")).toThrow(
      /calculatedTotalEtb must not be negative/,
    );
    expect(() => computeDiscount("1", "-1")).toThrow(
      /quotedTotalEtb must not be negative/,
    );
    expect(() => computeDiscount("1", "x")).toThrow(
      /quotedTotalEtb: not a valid decimal money string/,
    );
  });
});

describe("the three exports together (the real 8-page proforma)", () => {
  it("derives, allocates and records the discount without losing a cent", () => {
    const { subtotalEtb, taxAmountEtb, totalEtb } = deriveFromGrandTotal(
      "7835000.00",
      "15.00",
    );
    expect(sum([subtotalEtb, taxAmountEtb])).toBe(totalEtb);

    // Three machines on the line-item table, priced by the frozen formula.
    const lines = ["3000000.00", "2500000.00", "1910000.00"];
    const allocated = allocateToLines(lines, subtotalEtb);
    expect(sum(allocated)).toBe(subtotalEtb);

    const discount = computeDiscount("8521500.00", totalEtb);
    expect(discount).toEqual({
      discountAmountEtb: "686500.00",
      discountPercent: "8.06",
    });
  });
});
