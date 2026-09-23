import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import fixture from "../fixtures/latest-snapshot.json";
import type { FuturesBlock, OfficialForecast } from "../lib/snapshot";
import RevenuePanel from "./revenue-panel";

afterEach(cleanup);

const official = fixture.official as OfficialForecast;
const okFutures = fixture.futures as Extract<FuturesBlock, { status: "ok" }>;

function panel(futures: FuturesBlock | undefined = okFutures) {
  render(<RevenuePanel official={official} futures={futures} />);
}

function enterProduction(value: string) {
  fireEvent.change(screen.getByLabelText("Expected full-season production, kgMS"), {
    target: { value },
  });
}

describe("RevenuePanel", () => {
  it("labels the blank production input", () => {
    panel();

    const input = screen.getByLabelText("Expected full-season production, kgMS");
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("shows guidance and no revenue figures while production is blank", () => {
    panel();

    expect(
      screen.getByText(
        "Enter your expected full-season production in kgMS to see your revenue.",
      ),
    ).toBeDefined();
    expect(screen.queryByText(/NZ\$/)).toBeNull();
  });

  it("fills production from the explicit example action", () => {
    panel();

    fireEvent.click(
      screen.getByRole("button", { name: "Use 150,000 kgMS as an example" }),
    );

    const input = screen.getByLabelText(
      "Expected full-season production, kgMS",
    ) as HTMLInputElement;
    expect(input.value).toBe("150000");
    expect(screen.getByText("NZ$1,425,000")).toBeDefined();
  });

  it("compares official and futures revenue at 150,000 kgMS", () => {
    panel();
    enterProduction("150000");

    expect(screen.getByText("NZ$1,425,000")).toBeDefined();
    expect(screen.getByText("NZ$1,481,250")).toBeDefined();
    expect(
      screen.getByText("NZ$56,250 above the official forecast"),
    ).toBeDefined();
  });

  it("shows the plus or minus $0.50/kgMS sensitivity", () => {
    panel();
    enterProduction("150000");

    expect(
      screen.getByText("Sensitivity to a $0.50/kgMS price change"),
    ).toBeDefined();
    expect(screen.getByText("NZ$75,000")).toBeDefined();
  });

  it("describes a futures reference below the official forecast", () => {
    panel({ ...okFutures, basis: "prior-settlement", price: 9, bid: null, offer: null, last: null });
    enterProduction("150000");

    expect(
      screen.getByText("NZ$75,000 below the official forecast"),
    ).toBeDefined();
  });

  it("describes a sub-dollar revenue difference without claiming the prices match", () => {
    panel({ ...okFutures, basis: "prior-settlement", price: 9.5, bid: null, offer: null, last: null });
    enterProduction("150000");

    expect(
      screen.getByText("The revenue difference rounds to NZ$0."),
    ).toBeDefined();
  });

  it("describes the rounded difference at zero production with unequal prices", () => {
    panel();
    enterProduction("0");

    expect(
      screen.getByText("The revenue difference rounds to NZ$0."),
    ).toBeDefined();
  });

  it("describes a nonzero difference that still rounds to zero dollars", () => {
    panel();
    enterProduction("1");

    expect(
      screen.getByText("The revenue difference rounds to NZ$0."),
    ).toBeDefined();
  });

  it("shows a one-dollar difference once the raw difference reaches fifty cents", () => {
    panel({ ...okFutures, basis: "prior-settlement", price: 9, bid: null, offer: null, last: null });
    enterProduction("1");

    expect(
      screen.getByText("NZ$1 below the official forecast"),
    ).toBeDefined();
  });

  it("guides when finite production overflows the revenue calculation", () => {
    panel();
    enterProduction("9".repeat(308));

    expect(
      screen.getByText("This production is too large to calculate."),
    ).toBeDefined();
    expect(screen.queryByText(/NZ\$/)).toBeNull();
  });

  it("shows zero revenue for zero production rather than guidance", () => {
    panel();
    enterProduction("0");

    expect(screen.getAllByText("NZ$0")).toHaveLength(3);
  });

  it("guides non-numeric input without rendering results", () => {
    panel();
    enterProduction("abc");

    expect(
      screen.getByText("Enter production as a plain number in kgMS, like 150000."),
    ).toBeDefined();
    expect(screen.queryByText(/NZ\$/)).toBeNull();
  });

  it("guides excessive precision without rounding behind the user's back", () => {
    panel();
    enterProduction("150000.125");

    expect(
      screen.getByText("Use at most two decimal places for production."),
    ).toBeDefined();
    expect(screen.queryByText(/NZ\$/)).toBeNull();
  });

  it("keeps official revenue and omits futures figures when the reference is unavailable", () => {
    panel({ status: "unavailable", reason: "crossed" });
    enterProduction("150000");

    expect(screen.getByText("NZ$1,425,000")).toBeDefined();
    expect(
      screen.getByText("Futures revenue is unavailable right now."),
    ).toBeDefined();
    expect(screen.queryByText("NZ$1,481,250")).toBeNull();
    expect(screen.queryByText(/above the official forecast/)).toBeNull();
  });

  it("keeps the gross-revenue assumptions adjacent to the results", () => {
    panel();
    enterProduction("150000");

    const section = screen.getByRole("region", { name: "Your gross milk revenue" });
    expect(section.textContent).toContain("gross full-season milk revenue");
    expect(section.textContent).toContain("GST");
    expect(section.textContent).toContain("rounded to the nearest dollar");
  });
});
