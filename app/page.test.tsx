import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import fixture from "../fixtures/latest-snapshot.json";
import type { FuturesBlock, MilkSnapshot } from "../lib/snapshot";
import ComparisonView from "./comparison-view";

afterEach(cleanup);

const snapshot = fixture as unknown as MilkSnapshot;
const okFutures = snapshot.futures as Extract<FuturesBlock, { status: "ok" }>;

function view(withSnapshot: MilkSnapshot | null = snapshot) {
  render(<ComparisonView snapshot={withSnapshot} />);
}

describe("MilkCompass page shell", () => {
  it("announces the site name in the banner", () => {
    view();

    expect(screen.getByRole("banner").textContent).toContain("MilkCompass");
  });

  it("states the page purpose as the level-one heading", () => {
    view();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "What does the milk price mean for your farm?",
      }),
    ).toBeDefined();
  });

  it("offers exactly one main landmark", () => {
    view();

    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("shows the current season beside the brand", () => {
    view();

    expect(screen.getByRole("banner").textContent).toContain("2026/27 season");
  });
});

describe("official forecast card", () => {
  it("shows the midpoint with its unit", () => {
    view();

    expect(
      screen.getByText((_, element) => element?.textContent === "$9.50 /kgMS"),
    ).toBeDefined();
  });

  it("shows the published range", () => {
    view();

    expect(screen.getByText("Range $8.50-$10.50 /kgMS")).toBeDefined();
  });

  it("shows the announcement date", () => {
    view();

    expect(screen.getByText("Announced 21 Sept 2026")).toBeDefined();
  });

  it("shows the last successful source check for each card", () => {
    view();

    expect(screen.getAllByText("Checked 23 Sept 2026")).toHaveLength(2);
  });

  it("notes when the latest announcement left the forecast unchanged", () => {
    render(
      <ComparisonView
        snapshot={{
          ...snapshot,
          official: {
            ...snapshot.official,
            noChangeUpdate: { date: "2026-09-05" },
          },
        }}
      />,
    );

    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent === "Latest update 5 Sept 2026: no change",
      ),
    ).toBeDefined();
  });

  it("links to the official source", () => {
    view();

    const link = screen.getByRole("link", { name: "View official source" });
    expect(link.getAttribute("href")).toBe(fixture.official.sourceUrl);
  });
});

describe("futures reference card", () => {
  it("shows the selected reference price with its unit", () => {
    view();

    expect(
      screen.getByText((_, element) => element?.textContent === "$9.88 /kgMS"),
    ).toBeDefined();
  });

  it("names the basis as the midpoint of the quoted bid and offer", () => {
    view();

    expect(
      screen.getByText("Midpoint of bid $9.75 and offer $10.00"),
    ).toBeDefined();
  });

  it("identifies the contract and its expiry", () => {
    view();

    expect(
      screen.getByText("Contract MKPU27 · expires 30 Sept 2027"),
    ).toBeDefined();
  });

  it("shows the available volumes and open interest", () => {
    view();

    expect(
      screen.getByText(
        "Bid size 3 · Offer size 58 · Traded volume 0 · Open interest 11,351",
      ),
    ).toBeDefined();
  });

  it("shows when the quote was last updated in New Zealand time", () => {
    view();

    expect(
      screen.getByText("Quoted 23 Sept 2026, 11:30 am (NZ time)"),
    ).toBeDefined();
  });

  it("warns when the quote is older than 72 hours", () => {
    render(
      <ComparisonView
        snapshot={{
          ...snapshot,
          futures: { ...okFutures, stale: true },
        }}
      />,
    );

    expect(
      screen.getByText("Quote is more than 72 hours old."),
    ).toBeDefined();
  });

  it("links to the NZX quotes page", () => {
    view();

    const link = screen.getByRole("link", { name: "View NZX quotes" });
    expect(link.getAttribute("href")).toBe(fixture.futures.sourceUrl);
  });

  it("names a last-trade basis with its trade date", () => {
    render(
      <ComparisonView
        snapshot={{
          ...snapshot,
          futures: {
            ...okFutures,
            basis: "last-trade",
            bid: null,
            offer: null,
            last: 9.9,
            price: 9.9,
            tradedAt: "2026-09-22",
          },
        }}
      />,
    );

    expect(screen.getByText("Last trade on 22 Sept 2026")).toBeDefined();
  });

  it("names a prior-settlement basis plainly", () => {
    render(
      <ComparisonView
        snapshot={{
          ...snapshot,
          futures: {
            ...okFutures,
            basis: "prior-settlement",
            bid: null,
            offer: null,
            last: null,
            price: 9.85,
          },
        }}
      />,
    );

    expect(screen.getByText("Prior settlement")).toBeDefined();
  });

  it("explains deterministic unavailability reasons", () => {
    render(
      <ComparisonView
        snapshot={{
          ...snapshot,
          futures: { status: "unavailable", reason: "crossed" },
        }}
      />,
    );

    expect(
      screen.getByText("The futures market is crossed right now (bid above offer)."),
    ).toBeDefined();
  });

  it("shows a plain unavailable state when no futures block was collected", () => {
    const { futures, ...officialOnly } = snapshot;
    void futures;
    render(<ComparisonView snapshot={officialOnly} />);

    expect(
      screen.getByText("Futures reference is unavailable right now."),
    ).toBeDefined();
  });
});

describe("without a snapshot", () => {
  it("shows a deterministic unavailable state", () => {
    view(null);

    expect(
      screen.getByText("Reference prices are unavailable right now."),
    ).toBeDefined();
  });

  it("keeps the page shell and heading", () => {
    view(null);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "What does the milk price mean for your farm?",
      }),
    ).toBeDefined();
  });
});

describe("footer", () => {
  it("flags displayed figures as sample data, not live prices", () => {
    view();

    expect(screen.getByRole("contentinfo").textContent).toContain(
      "not live prices",
    );
  });
});
