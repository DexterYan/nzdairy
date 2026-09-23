import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fixture from "../fixtures/latest-snapshot.json";
import { saveScenarios } from "../lib/scenarios";
import type { FuturesBlock, OfficialForecast } from "../lib/snapshot";
import RevenuePanel from "./revenue-panel";

afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
});

const official = fixture.official as OfficialForecast;
const okFutures = fixture.futures as Extract<FuturesBlock, { status: "ok" }>;

function panel(
  futures: FuturesBlock | undefined = okFutures,
  season = "2026/27",
  storage: Storage | null | undefined = undefined,
  withOfficial: OfficialForecast = official,
) {
  render(
    <RevenuePanel
      official={withOfficial}
      futures={futures}
      season={season}
      storage={storage}
    />,
  );
}

function scenarioInput(name: string) {
  return screen.getByLabelText(name) as HTMLInputElement;
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
    expect(screen.getAllByText("NZ$1,425,000").length).toBeGreaterThan(0);
  });

  it("compares official and futures revenue at 150,000 kgMS", () => {
    panel();
    enterProduction("150000");

    expect(screen.getAllByText("NZ$1,425,000").length).toBe(2);
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

    expect(screen.getAllByText("NZ$0")).toHaveLength(6);
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

    expect(screen.getAllByText("NZ$1,425,000").length).toBe(2);
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

describe("scenario prices", () => {
  it("initialises low, midpoint, and high from the published range", () => {
    panel();

    expect(scenarioInput("Low price, NZD/kgMS").value).toBe("8.5");
    expect(scenarioInput("Midpoint price, NZD/kgMS").value).toBe("9.5");
    expect(scenarioInput("High price, NZD/kgMS").value).toBe("10.5");
  });

  it("shows each scenario's revenue at 150,000 kgMS", () => {
    panel();
    enterProduction("150000");

    expect(screen.getByText("NZ$1,275,000")).toBeDefined();
    expect(screen.getByText("NZ$1,575,000")).toBeDefined();
  });

  it("leaves missing range endpoints blank and editable", () => {
    panel(okFutures, "2026/27", undefined, {
      ...official,
      low: null,
      high: null,
      rangeSource: "none",
    });
    enterProduction("150000");

    const low = scenarioInput("Low price, NZD/kgMS");
    expect(low.value).toBe("");
    expect(screen.queryByText("NZ$1,275,000")).toBeNull();

    fireEvent.change(low, { target: { value: "8.5" } });
    expect(screen.getByText("NZ$1,275,000")).toBeDefined();
  });

  it("shows guidance for an invalid scenario price without a revenue", () => {
    panel();
    enterProduction("150000");

    fireEvent.change(scenarioInput("Low price, NZD/kgMS"), {
      target: { value: "8.5.1" },
    });

    expect(
      screen.getByText(
        "Use a plain number with at most three decimal places.",
      ),
    ).toBeDefined();
    expect(screen.queryByText("NZ$1,275,000")).toBeNull();
  });

  it("keeps user edits across a refresh instead of the official values", async () => {
    panel();
    fireEvent.change(scenarioInput("Midpoint price, NZD/kgMS"), {
      target: { value: "9" },
    });
    cleanup();

    panel();
    await act(async () => {});
    expect(scenarioInput("Midpoint price, NZD/kgMS").value).toBe("9");
  });

  it("never lets new source data overwrite edited scenarios", async () => {
    panel();
    fireEvent.change(scenarioInput("Midpoint price, NZD/kgMS"), {
      target: { value: "9" },
    });
    cleanup();

    panel(okFutures, "2026/27", undefined, { ...official, midpoint: 9.6 });
    await act(async () => {});
    expect(scenarioInput("Midpoint price, NZD/kgMS").value).toBe("9");
  });

  it("restores the published values and clears storage on reset", async () => {
    panel();
    fireEvent.change(scenarioInput("Midpoint price, NZD/kgMS"), {
      target: { value: "9" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Reset scenarios to Fonterra's published values",
      }),
    );

    expect(scenarioInput("Midpoint price, NZD/kgMS").value).toBe("9.5");
    cleanup();

    panel();
    await act(async () => {});
    expect(scenarioInput("Midpoint price, NZD/kgMS").value).toBe("9.5");
  });

  it("starts a rolled-over season from the official values, not last season's edits", async () => {
    panel();
    fireEvent.change(scenarioInput("Midpoint price, NZD/kgMS"), {
      target: { value: "9" },
    });
    cleanup();

    panel(okFutures, "2027/28");
    await act(async () => {});
    expect(scenarioInput("Midpoint price, NZD/kgMS").value).toBe("9.5");
  });

  it("stays usable when local storage is blocked", () => {
    const blocked: Storage = {
      length: 0,
      clear: () => {},
      key: () => null,
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    panel(okFutures, "2026/27", blocked);

    expect(scenarioInput("Midpoint price, NZD/kgMS").value).toBe("9.5");
    fireEvent.change(scenarioInput("Midpoint price, NZD/kgMS"), {
      target: { value: "9" },
    });
    expect(scenarioInput("Midpoint price, NZD/kgMS").value).toBe("9");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Reset scenarios to Fonterra's published values",
      }),
    );
    expect(scenarioInput("Midpoint price, NZD/kgMS").value).toBe("9.5");
  });

  it("completes the flow with native controls only", () => {
    panel();
    enterProduction("150000");

    const production = screen.getByLabelText(
      "Expected full-season production, kgMS",
    ) as HTMLInputElement;
    const example = screen.getByRole("button", {
      name: "Use 150,000 kgMS as an example",
    }) as HTMLButtonElement;
    const reset = screen.getByRole("button", {
      name: "Reset scenarios to Fonterra's published values",
    }) as HTMLButtonElement;

    expect(production.disabled).toBe(false);
    expect(example.disabled).toBe(false);
    expect(reset.disabled).toBe(false);
    expect(production.type).toBe("text");
    expect(scenarioInput("Low price, NZD/kgMS").type).toBe("text");
  });

  it("keeps session-only edits when storage is unavailable and source data updates", async () => {
    const view = render(
      <RevenuePanel
        official={official}
        futures={okFutures}
        season="2026/27"
        storage={null}
      />,
    );
    await act(async () => {});
    fireEvent.change(scenarioInput("Midpoint price, NZD/kgMS"), {
      target: { value: "9" },
    });

    view.rerender(
      <RevenuePanel
        official={{ ...official, midpoint: 9.6 }}
        futures={okFutures}
        season="2026/27"
        storage={null}
      />,
    );
    await act(async () => {});

    expect(scenarioInput("Midpoint price, NZD/kgMS").value).toBe("9");
  });

  it("keeps session-only edits when storage throws and source data updates", async () => {
    const blocked: Storage = {
      length: 0,
      clear: () => {},
      key: () => null,
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const view = render(
      <RevenuePanel
        official={official}
        futures={okFutures}
        season="2026/27"
        storage={blocked}
      />,
    );
    await act(async () => {});
    fireEvent.change(scenarioInput("Midpoint price, NZD/kgMS"), {
      target: { value: "9" },
    });

    view.rerender(
      <RevenuePanel
        official={{ ...official, midpoint: 9.6 }}
        futures={okFutures}
        season="2026/27"
        storage={blocked}
      />,
    );
    await act(async () => {});

    expect(scenarioInput("Midpoint price, NZD/kgMS").value).toBe("9");
  });

  it("loads the new season's scenarios when the season changes on the same mount", async () => {
    saveScenarios(window.localStorage, "2026/27", {
      low: "8",
      midpoint: "9",
      high: "11",
    });
    const view = render(
      <RevenuePanel
        official={official}
        futures={okFutures}
        season="2026/27"
      />,
    );
    await act(async () => {});
    expect(scenarioInput("Midpoint price, NZD/kgMS").value).toBe("9");

    view.rerender(
      <RevenuePanel
        official={official}
        futures={okFutures}
        season="2027/28"
      />,
    );
    await act(async () => {});

    expect(scenarioInput("Midpoint price, NZD/kgMS").value).toBe("9.5");
  });

  it("reloads scenarios for a new season after session-only edits", async () => {
    const view = render(
      <RevenuePanel
        official={official}
        futures={okFutures}
        season="2026/27"
        storage={null}
      />,
    );
    await act(async () => {});
    fireEvent.change(scenarioInput("Midpoint price, NZD/kgMS"), {
      target: { value: "9" },
    });

    view.rerender(
      <RevenuePanel
        official={official}
        futures={okFutures}
        season="2027/28"
        storage={null}
      />,
    );
    await act(async () => {});

    expect(scenarioInput("Midpoint price, NZD/kgMS").value).toBe("9.5");
  });

  it("flags an invalid scenario price to assistive technology", () => {
    panel();
    const input = scenarioInput("Low price, NZD/kgMS");
    fireEvent.change(input, { target: { value: "8.5.1" } });

    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBe("scenario-low-guidance");
    expect(document.getElementById(describedBy as string)?.textContent).toBe(
      "Use a plain number with at most three decimal places.",
    );
  });

  it("hides a scenario revenue that would overflow instead of showing it", () => {
    panel();
    enterProduction("9".repeat(307));
    fireEvent.change(scenarioInput("Midpoint price, NZD/kgMS"), {
      target: { value: "999999" },
    });

    expect(screen.queryByText(/Infinity|NaN/)).toBeNull();
    expect(screen.getAllByText(/NZ\$/).length).toBeGreaterThan(0);
  });
});
