import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fixture from "../fixtures/latest-snapshot.json";
import { saveScenarios } from "../lib/scenarios";
import type { FuturesBlock, OfficialForecast } from "../lib/snapshot";
import RevenuePanel, { type Movement } from "./revenue-panel";

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
  movements?: Movement[],
) {
  render(
    <RevenuePanel
      official={withOfficial}
      futures={futures}
      season={season}
      storage={storage}
      movements={movements}
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
    expect(screen.getByText("+NZ$56,250")).toBeDefined();
    expect(screen.getByText("above the official forecast")).toBeDefined();
  });

  it("shows the plus or minus $0.50/kgMS sensitivity", () => {
    panel();
    enterProduction("150000");

    expect(screen.getByText("$0.50/kgMS sensitivity")).toBeDefined();
    expect(screen.getByText("NZ$75,000")).toBeDefined();
    expect(screen.getByText("per $0.50 move")).toBeDefined();
  });

  it("describes a futures reference below the official forecast", () => {
    panel({ ...okFutures, basis: "prior-settlement", price: 9, bid: null, offer: null, last: null });
    enterProduction("150000");

    expect(screen.getByText("-NZ$75,000")).toBeDefined();
    expect(screen.getByText("below the official forecast")).toBeDefined();
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

    expect(screen.getByText("-NZ$1")).toBeDefined();
    expect(screen.getByText("below the official forecast")).toBeDefined();
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

    expect(screen.getAllByText("NZ$0")).toHaveLength(7);
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

describe("production slider", () => {
  function slider() {
    return screen.getByRole("slider", {
      name: "Production slider",
    }) as HTMLInputElement;
  }

  it("renders a native range input with interaction bounds and a parked default", () => {
    panel();

    const input = slider();
    expect(input.type).toBe("range");
    expect(input.min).toBe("20000");
    expect(input.max).toBe("500000");
    expect(input.step).toBe("1000");
    expect(input.value).toBe("150000");
    expect(input.disabled).toBe(false);
  });

  it("never writes the parked default into a blank text field", () => {
    panel();

    expect(
      (screen.getByLabelText("Expected full-season production, kgMS") as HTMLInputElement)
        .value,
    ).toBe("");

    // Interacting elsewhere must not let the parked thumb write either.
    fireEvent.change(scenarioInput("Low price, NZD/kgMS"), {
      target: { value: "8" },
    });
    expect(
      (screen.getByLabelText("Expected full-season production, kgMS") as HTMLInputElement)
        .value,
    ).toBe("");
  });

  it("moves the thumb to a typed in-bounds value", () => {
    panel();
    enterProduction("200000");
    expect(slider().value).toBe("200000");
  });

  it("parks an off-step typed value at the nearest stop", () => {
    panel();
    enterProduction("254999");
    expect(slider().value).toBe("255000");
    expect(
      (screen.getByLabelText("Expected full-season production, kgMS") as HTMLInputElement)
        .value,
    ).toBe("254999");
  });

  it("parks the thumb at the nearest stop without touching out-of-range text", () => {
    panel();
    enterProduction("600000");

    expect(slider().value).toBe("500000");
    expect(screen.getAllByText("NZ$5,700,000").length).toBeGreaterThan(0);

    cleanup();
    panel();
    enterProduction("0");

    expect(slider().value).toBe("20000");
    expect(screen.getAllByText("NZ$0").length).toBeGreaterThan(0);
  });

  it("keeps the thumb at the last valid position while text is invalid", () => {
    panel();
    enterProduction("200000");
    enterProduction("abc");

    expect(slider().value).toBe("200000");
  });

  it("writes the stepped value through to the text field on drag", () => {
    panel();
    fireEvent.change(slider(), { target: { value: "250000" } });

    expect(
      (screen.getByLabelText("Expected full-season production, kgMS") as HTMLInputElement)
        .value,
    ).toBe("250000");
    expect(screen.getAllByText("NZ$2,375,000").length).toBeGreaterThan(0);
  });

  it("names its units and approximation for assistive technology", () => {
    panel();

    const describedBy = slider().getAttribute("aria-describedby");
    expect(describedBy).toContain("production-slider-note");
    const note = document.getElementById("production-slider-note");
    expect(note?.textContent).toContain("kgMS");
    expect(note?.textContent).toContain("approximate");
  });

  it("flags invalid production to assistive technology like the scenario inputs", () => {
    panel();
    const input = screen.getByLabelText(
      "Expected full-season production, kgMS",
    ) as HTMLInputElement;

    expect(input.getAttribute("aria-invalid")).toBeNull();
    enterProduction("abc");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBe("production-guidance");
    expect(document.getElementById("production-guidance")?.textContent).toBe(
      "Enter production as a plain number in kgMS, like 150000.",
    );
  });
});

describe("stat tiles", () => {
  it("renders four tiles with labels, values, and sub-captions", () => {
    panel();
    enterProduction("150000");

    for (const label of [
      "Official forecast revenue",
      "Futures reference revenue",
      "Futures vs official",
      "$0.50/kgMS sensitivity",
    ]) {
      expect(screen.getByText(label)).toBeDefined();
    }
    expect(screen.getAllByText("NZ$1,425,000").length).toBe(2);
    expect(screen.getByText("NZ$1,481,250")).toBeDefined();
    expect(screen.getByText("+NZ$56,250")).toBeDefined();
    expect(screen.getAllByText("NZ$75,000").length).toBe(1);
    expect(screen.getByText("at $9.50 /kgMS")).toBeDefined();
    expect(screen.getByText("at $9.88 /kgMS")).toBeDefined();
    expect(screen.getByText("per $0.50 move")).toBeDefined();
  });

  it("colours the delta value only through up and down classes", () => {
    panel();
    enterProduction("150000");
    expect(screen.getByText("+NZ$56,250").className).toContain("tileValueUp");

    cleanup();
    panel({ ...okFutures, basis: "prior-settlement", price: 9, bid: null, offer: null, last: null });
    enterProduction("150000");
    expect(screen.getByText("-NZ$75,000").className).toContain("tileValueDown");

    cleanup();
    panel({ ...okFutures, basis: "prior-settlement", price: 9.5, bid: null, offer: null, last: null });
    enterProduction("150000");
    // Equal prices: every tile except the delta shows a nonzero figure.
    const tileValues = screen
      .getAllByText("NZ$0")
      .filter((el) => el.className.includes("tileValue"));
    expect(tileValues).toHaveLength(1);
    for (const el of tileValues) {
      expect(el.className).not.toContain("tileValueUp");
      expect(el.className).not.toContain("tileValueDown");
    }
  });

  it("renders two tiles and a guidance cell when futures is unavailable", () => {
    panel({ status: "unavailable", reason: "crossed" });
    enterProduction("150000");

    expect(screen.getByText("Official forecast revenue")).toBeDefined();
    expect(screen.getByText("$0.50/kgMS sensitivity")).toBeDefined();
    expect(screen.queryByText("Futures vs official")).toBeNull();
    expect(screen.queryByText("NZ$1,481,250")).toBeNull();
    expect(
      screen.getByText("Futures revenue is unavailable right now."),
    ).toBeDefined();
  });

  it("renders two tiles and a guidance cell when the futures block is absent", () => {
    // Render directly: the panel() helper's default would fill undefined back in.
    render(
      <RevenuePanel
        official={official}
        futures={undefined}
        season="2026/27"
      />,
    );
    enterProduction("150000");

    expect(screen.getByText("Official forecast revenue")).toBeDefined();
    expect(screen.getByText("$0.50/kgMS sensitivity")).toBeDefined();
    expect(screen.queryByText("Futures vs official")).toBeNull();
    expect(
      screen.getByText("Futures revenue is unavailable right now."),
    ).toBeDefined();
  });

  it("renders all four tiles when no range is published", () => {
    panel(okFutures, "2026/27", undefined, {
      ...official,
      low: null,
      high: null,
      rangeSource: "none",
    });
    enterProduction("150000");

    expect(screen.getByText("Futures reference revenue")).toBeDefined();
    expect(screen.getByText("Futures vs official")).toBeDefined();
  });

  it("renders no tiles while production is blank", () => {
    panel();

    expect(screen.queryByText("Official forecast revenue")).toBeNull();
    expect(screen.queryByText("$0.50/kgMS sensitivity")).toBeNull();
  });

  it("renders no tiles for invalid production", () => {
    panel();
    enterProduction("abc");

    expect(screen.queryByText("Official forecast revenue")).toBeNull();
  });

  it("renders no tiles when the calculation overflows", () => {
    panel();
    enterProduction("9".repeat(308));

    expect(screen.queryByText("Official forecast revenue")).toBeNull();
    expect(screen.queryByText("$0.50/kgMS sensitivity")).toBeNull();
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

describe("movement tiles", () => {
  const weekly: Movement = {
    label: "Impact of the weekly move",
    delta: 0.2,
    since: "17 Sept 2026",
  };
  const announcement: Movement = {
    label: "Impact of the announcement move",
    delta: -0.15,
    since: "12 Jun 2026",
  };

  function movementsPanel(withMovements: Movement[] | undefined = [weekly]) {
    panel(okFutures, "2026/27", undefined, official, withMovements);
  }

  it("renders a movement tile per comparable period with its caption", () => {
    movementsPanel([weekly, announcement]);
    enterProduction("150000");

    expect(
      screen.getByRole("heading", { name: "What a move means for you" }),
    ).toBeDefined();
    expect(screen.getByText("Impact of the weekly move")).toBeDefined();
    expect(screen.getByText("Impact of the announcement move")).toBeDefined();
    expect(screen.getByText("+NZ$30,000").className).toContain("tileValueUp");
    expect(
      screen.getByText("+$0.20/kgMS since 17 Sept 2026 at your production"),
    ).toBeDefined();
    expect(screen.getByText("-NZ$22,500").className).toContain("tileValueDown");
    expect(
      screen.getByText("-$0.15/kgMS since 12 Jun 2026 at your production"),
    ).toBeDefined();
  });

  it("rounds a sub-half-dollar impact to NZ$0 without claiming a move", () => {
    movementsPanel();
    enterProduction("1");

    expect(screen.getByText("Impact of the weekly move")).toBeDefined();
    expect(
      screen
        .getAllByText("NZ$0")
        .filter((el) => el.className.includes("tileValue")).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("The revenue difference rounds to NZ$0.").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("shows NZ$0 movement tiles at zero production", () => {
    movementsPanel();
    enterProduction("0");

    expect(screen.getByText("Impact of the weekly move")).toBeDefined();
    expect(screen.getAllByText("NZ$0").length).toBe(8);
  });

  it("omits movement tiles while production is blank", () => {
    movementsPanel();

    expect(
      screen.queryByRole("heading", { name: "What a move means for you" }),
    ).toBeNull();
  });

  it("omits movement tiles for invalid production", () => {
    movementsPanel();
    enterProduction("abc");

    expect(
      screen.queryByRole("heading", { name: "What a move means for you" }),
    ).toBeNull();
  });

  it("omits movement tiles when the calculation overflows", () => {
    movementsPanel();
    enterProduction("9".repeat(308));

    expect(
      screen.queryByRole("heading", { name: "What a move means for you" }),
    ).toBeNull();
  });

  it("renders nothing without movements", () => {
    panel();
    enterProduction("150000");

    expect(
      screen.queryByRole("heading", { name: "What a move means for you" }),
    ).toBeNull();
  });

  it("updates the movement value while typing", () => {
    movementsPanel();
    enterProduction("150000");
    enterProduction("200000");

    expect(screen.getByText("+NZ$40,000")).toBeDefined();
  });

  it("updates the movement value from the slider", () => {
    movementsPanel();
    enterProduction("150000");
    fireEvent.change(
      screen.getByRole("slider", { name: "Production slider" }),
      { target: { value: "250000" } },
    );

    expect(screen.getByText("+NZ$50,000")).toBeDefined();
  });

  it("keeps movement tiles while scenarios are edited", () => {
    movementsPanel([weekly, announcement]);
    enterProduction("150000");
    fireEvent.change(scenarioInput("Low price, NZD/kgMS"), {
      target: { value: "8" },
    });

    expect(screen.getByText("NZ$1,200,000")).toBeDefined();
    expect(screen.getByText("Impact of the weekly move")).toBeDefined();
    expect(screen.getByText("Impact of the announcement move")).toBeDefined();
  });
});
