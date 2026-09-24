import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import fixture from "../fixtures/latest-snapshot.json";
import historyFixture from "../fixtures/release/history.json";
import {
  canonicalIdentity,
  type HistoryEntry,
  type SeasonHistory,
} from "../lib/history";
import type { ReadProvenance } from "../lib/release";
import type { FuturesBlock, MilkSnapshot } from "../lib/snapshot";
import ComparisonView from "./comparison-view";

afterEach(cleanup);

const snapshot = fixture as unknown as MilkSnapshot;
const okFutures = snapshot.futures as Extract<FuturesBlock, { status: "ok" }>;
const fixtureHistory = historyFixture as unknown as SeasonHistory;
// Fixed display clock: the fixture quote is 6.5h old, checks are current.
const FIXED_NOW = Date.parse("2026-09-23T06:00:00Z");

// A last-trade reference matching the fixture history's futures basis.
const lastTradeSnapshot: MilkSnapshot = {
  ...snapshot,
  futures: {
    ...okFutures,
    basis: "last-trade",
    bid: null,
    offer: null,
    last: 9.7,
    price: 9.7,
    tradedAt: "2026-09-21",
  },
};

function futEntry(on: string, value: number): HistoryEntry {
  return {
    identity: canonicalIdentity({
      series: "mkp-futures",
      provider: "nzx",
      market: "MKPU27",
      basis: "last-trade",
      effective: { kind: "date", on },
    }),
    series: "mkp-futures",
    provider: "nzx",
    market: "MKPU27",
    basis: "last-trade",
    effective: { kind: "date", on },
    revisions: [
      {
        payload: { value, low: null, high: null, currency: "NZD", unit: "NZD/kgMS" },
        publishedAt: null,
        firstSeenAt: "2026-09-01T06:00:00Z",
        parserVersion: "test",
      },
    ],
  };
}

function annEntry(on: string, value: number, low: number, high: number): HistoryEntry {
  return {
    identity: canonicalIdentity({
      series: "official-forecast",
      provider: "fonterra",
      market: "2026/27",
      basis: "announcement",
      effective: { kind: "date", on },
    }),
    series: "official-forecast",
    provider: "fonterra",
    market: "2026/27",
    basis: "announcement",
    effective: { kind: "date", on },
    revisions: [
      {
        payload: { value, low, high, currency: "NZD", unit: "NZD/kgMS" },
        publishedAt: null,
        firstSeenAt: "2026-09-01T06:00:00Z",
        parserVersion: "test",
      },
    ],
  };
}

const historyOf = (entries: HistoryEntry[]): SeasonHistory => ({
  schemaVersion: 1,
  season: "2026/27",
  materialisedAt: "2026-09-23T06:00:00Z",
  entries,
});

function view(
  withSnapshot: MilkSnapshot | null = snapshot,
  nowMs: number = FIXED_NOW,
  provenance?: ReadProvenance,
  history?: SeasonHistory | null,
) {
  render(
    <ComparisonView
      snapshot={withSnapshot}
      nowMs={nowMs}
      provenance={provenance}
      history={history}
    />,
  );
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

  it("offers the production input below the price comparison", () => {
    view();

    expect(
      screen.getByLabelText("Expected full-season production, kgMS"),
    ).toBeDefined();
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
        nowMs={FIXED_NOW}
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

  it("warns when the quote is older than 72 hours at display time, whatever the collector recorded", () => {
    render(
      <ComparisonView
        nowMs={FIXED_NOW}
        snapshot={{
          ...snapshot,
          futures: { ...okFutures, stale: false, quotedAt: "2026-09-19T00:00:00Z" },
        }}
      />,
    );

    expect(
      screen.getByText("Quote is more than 72 hours old."),
    ).toBeDefined();
  });

  it("does not warn about a fresh quote the collector flagged stale", () => {
    render(
      <ComparisonView
        nowMs={FIXED_NOW}
        snapshot={{
          ...snapshot,
          futures: { ...okFutures, stale: true },
        }}
      />,
    );

    expect(screen.queryByText("Quote is more than 72 hours old.")).toBeNull();
  });

  it("warns on both cards when the latest collection check is more than 36 hours old", () => {
    render(
      <ComparisonView
        nowMs={FIXED_NOW}
        snapshot={{
          ...snapshot,
          checks: {
            official: {
              source: "official",
              checkedAt: "2026-09-21T00:00:00Z",
              outcome: "ok",
              detail: null,
            },
            futures: {
              source: "futures",
              checkedAt: "2026-09-21T00:00:00Z",
              outcome: "ok",
              detail: null,
            },
          },
        }}
      />,
    );

    expect(
      screen.getAllByText("The last check is more than 36 hours old."),
    ).toHaveLength(2);
  });

  it("does not warn about check freshness while checks stay current", () => {
    render(
      <ComparisonView
        nowMs={FIXED_NOW}
        snapshot={{
          ...snapshot,
          checks: {
            official: {
              source: "official",
              checkedAt: "2026-09-23T06:00:00Z",
              outcome: "ok",
              detail: null,
            },
            futures: {
              source: "futures",
              checkedAt: "2026-09-23T06:00:00Z",
              outcome: "ok",
              detail: null,
            },
          },
        }}
      />,
    );

    expect(
      screen.queryByText("The last check is more than 36 hours old."),
    ).toBeNull();
  });

  it("says when a failed official check left the previous value on show", () => {
    render(
      <ComparisonView
        nowMs={FIXED_NOW}
        snapshot={{
          ...snapshot,
          checks: {
            official: {
              source: "official",
              checkedAt: "2026-09-23T06:00:00Z",
              outcome: "retained",
              detail: "fetch-failed: status 503",
            },
            futures: {
              source: "futures",
              checkedAt: "2026-09-23T06:00:00Z",
              outcome: "ok",
              detail: null,
            },
          },
        }}
      />,
    );

    expect(
      screen.getByText(
        "The latest collection on 23 Sept 2026 failed — showing the previous value.",
      ),
    ).toBeDefined();
  });

  it("says when a failed futures check left the previous value on show", () => {
    render(
      <ComparisonView
        nowMs={FIXED_NOW}
        snapshot={{
          ...snapshot,
          checks: {
            official: {
              source: "official",
              checkedAt: "2026-09-23T06:00:00Z",
              outcome: "ok",
              detail: null,
            },
            futures: {
              source: "futures",
              checkedAt: "2026-09-23T06:00:00Z",
              outcome: "retained",
              detail: "unavailable:crossed",
            },
          },
        }}
      />,
    );

    expect(
      screen.getByText(
        "The latest collection on 23 Sept 2026 failed — showing the previous value.",
      ),
    ).toBeDefined();
  });

  it("does not report a failed collection when both checks succeeded", () => {
    render(
      <ComparisonView
        nowMs={FIXED_NOW}
        snapshot={{
          ...snapshot,
          checks: {
            official: {
              source: "official",
              checkedAt: "2026-09-23T06:00:00Z",
              outcome: "ok",
              detail: null,
            },
            futures: {
              source: "futures",
              checkedAt: "2026-09-23T06:00:00Z",
              outcome: "ok",
              detail: null,
            },
          },
        }}
      />,
    );

    expect(
      screen.queryByText(
        "The latest collection on 23 Sept 2026 failed — showing the previous value.",
      ),
    ).toBeNull();
  });

  it("links to the NZX quotes page", () => {
    view();

    const link = screen.getByRole("link", { name: "View NZX quotes" });
    expect(link.getAttribute("href")).toBe(fixture.futures.sourceUrl);
  });

  it("names a last-trade basis with its trade date", () => {
    render(
      <ComparisonView
        nowMs={FIXED_NOW}
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
        nowMs={FIXED_NOW}
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
        nowMs={FIXED_NOW}
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

  it("exposes a futures check that never collected any data", () => {
    render(
      <ComparisonView
        nowMs={FIXED_NOW}
        snapshot={{
          ...snapshot,
          futures: { status: "unavailable", reason: "not-collected" },
        }}
      />,
    );

    expect(
      screen.getByText(
        "The futures reference was not collected in the last check.",
      ),
    ).toBeDefined();
  });

  it("ages an unavailable futures reference by its latest check", () => {
    render(
      <ComparisonView
        nowMs={FIXED_NOW}
        snapshot={{
          ...snapshot,
          futures: { status: "unavailable", reason: "crossed" },
          checks: {
            official: {
              source: "official",
              checkedAt: "2026-09-23T06:00:00Z",
              outcome: "ok",
              detail: null,
            },
            futures: {
              source: "futures",
              checkedAt: "2026-09-21T00:00:00Z",
              outcome: "unavailable",
              detail: "unavailable:crossed",
            },
          },
        }}
      />,
    );

    expect(screen.getByText("Checked 21 Sept 2026")).toBeDefined();
    expect(
      screen.getByText("The last check is more than 36 hours old."),
    ).toBeDefined();
    // Nothing was retained, so no previous value can be claimed.
    expect(
      screen.queryByText(
        "The latest collection on 21 Sept 2026 failed — showing the previous value.",
      ),
    ).toBeNull();
  });

  it("ages a missing futures block by the collection run itself", () => {
    const { futures, ...officialOnly } = snapshot;
    void futures;
    const withoutFutures = {
      ...officialOnly,
      collectedAt: "2026-09-21T00:00:00Z",
    } as MilkSnapshot;
    render(<ComparisonView snapshot={withoutFutures} nowMs={FIXED_NOW} />);

    expect(
      screen.getByText("The last check is more than 36 hours old."),
    ).toBeDefined();
  });

  it("shows a plain unavailable state when no futures block was collected", () => {
    const { futures, ...officialOnly } = snapshot;
    void futures;
    render(<ComparisonView snapshot={officialOnly} nowMs={FIXED_NOW} />);

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

  it("labels a collected release with its collection date", () => {
    view(snapshot, FIXED_NOW, "collected");

    expect(screen.getByRole("contentinfo").textContent).toContain(
      "Collected from Fonterra and NZX on 23 Sept 2026 — delayed reference data, not live prices.",
    );
  });

  it("labels a fixture release as a development preview", () => {
    view(snapshot, FIXED_NOW, "fixture");

    expect(screen.getByRole("contentinfo").textContent).toContain(
      "Development preview — showing a fixture snapshot, not live prices.",
    );
  });

  it("defaults to unknown provenance for legacy data, never guessing live", () => {
    view(snapshot, FIXED_NOW, "unknown");
    const footer = screen.getByRole("contentinfo").textContent ?? "";

    expect(footer).toContain(
      "Reference data collected from official sources; collection date unknown — not live prices.",
    );
    expect(footer).not.toContain("frozen fixture");
  });

  it("keeps the unknown label when no snapshot loaded", () => {
    view(null, FIXED_NOW, "unknown");

    expect(screen.getByRole("contentinfo").textContent).toContain(
      "collection date unknown",
    );
  });
});

describe("basis tags", () => {
  it("tags the official card as a forecast", () => {
    view();

    expect(screen.getByText("FORECAST")).toBeDefined();
  });

  it("tags the futures card with its selected basis", () => {
    view();

    expect(screen.getByText("MIDPOINT")).toBeDefined();
  });

  it("re-tags the futures card for a last-trade basis", () => {
    render(
      <ComparisonView
        nowMs={FIXED_NOW}
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

    expect(screen.getByText("LAST TRADE")).toBeDefined();
  });

  it("re-tags the futures card for a prior-settlement basis", () => {
    render(
      <ComparisonView
        nowMs={FIXED_NOW}
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

    expect(screen.getByText("PRIOR SETTLE")).toBeDefined();
  });
});

describe("status chips", () => {
  it("marks both cards up to date when value and checks are fresh", () => {
    view();

    expect(screen.getAllByText("Up to date")).toHaveLength(2);
  });

  it("suppresses the up-to-date chip on a card with an old quote", () => {
    render(
      <ComparisonView
        nowMs={FIXED_NOW}
        snapshot={{
          ...snapshot,
          futures: { ...okFutures, stale: false, quotedAt: "2026-09-19T00:00:00Z" },
        }}
      />,
    );

    expect(screen.getAllByText("Up to date")).toHaveLength(1);
  });

  it("suppresses every up-to-date chip while checks are stale", () => {
    render(
      <ComparisonView
        nowMs={FIXED_NOW}
        snapshot={{
          ...snapshot,
          checks: {
            official: {
              source: "official",
              checkedAt: "2026-09-21T00:00:00Z",
              outcome: "ok",
              detail: null,
            },
            futures: {
              source: "futures",
              checkedAt: "2026-09-21T00:00:00Z",
              outcome: "ok",
              detail: null,
            },
          },
        }}
      />,
    );

    expect(screen.queryByText("Up to date")).toBeNull();
  });

  it("suppresses the up-to-date chip on a card showing a retained value", () => {
    render(
      <ComparisonView
        nowMs={FIXED_NOW}
        snapshot={{
          ...snapshot,
          checks: {
            official: {
              source: "official",
              checkedAt: "2026-09-23T06:00:00Z",
              outcome: "ok",
              detail: null,
            },
            futures: {
              source: "futures",
              checkedAt: "2026-09-23T06:00:00Z",
              outcome: "retained",
              detail: "unavailable:crossed",
            },
          },
        }}
      />,
    );

    expect(screen.getAllByText("Up to date")).toHaveLength(1);
  });

  it("chips an unavailable futures card without claiming freshness", () => {
    render(
      <ComparisonView
        nowMs={FIXED_NOW}
        snapshot={{
          ...snapshot,
          futures: { status: "unavailable", reason: "crossed" },
        }}
      />,
    );

    expect(screen.getByText("Unavailable")).toBeDefined();
    expect(screen.getAllByText("Up to date")).toHaveLength(1);
  });
});

describe("footer source credits", () => {
  it("credits both sources beside the sample-data notice", () => {
    view();

    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toContain("Fonterra forecast");
    expect(footer.textContent).toContain("NZX futures");
    expect(footer.textContent).toContain("not live prices");
  });
});

describe("comparison strip wiring", () => {
  it("plots both references under the comparison cards", () => {
    view();

    const figure = screen.getByRole("img", { name: /Futures \$9\.88/ });
    expect(figure.getAttribute("aria-label")).toContain("Futures $9.88");
  });

  it("plots the official range alone when futures is unavailable", () => {
    render(
      <ComparisonView
        nowMs={FIXED_NOW}
        snapshot={{
          ...snapshot,
          futures: { status: "unavailable", reason: "crossed" },
        }}
      />,
    );

    expect(
      screen
        .getByRole("img", { name: /Official forecast midpoint/ })
        .getAttribute("aria-label"),
    ).toContain("Official forecast midpoint");
  });
});

describe("season history", () => {
  it("renders the history section from the release history", () => {
    view(lastTradeSnapshot, FIXED_NOW, undefined, fixtureHistory);

    expect(screen.getByRole("region", { name: "Season history" })).toBeDefined();
  });

  it("shows no history section without a snapshot", () => {
    view(null);

    expect(screen.queryByRole("region", { name: "Season history" })).toBeNull();
  });
});

describe("what changed", () => {
  it("summarises comparable weekly and since-announcement moves", () => {
    view(
      lastTradeSnapshot,
      FIXED_NOW,
      undefined,
      historyOf([
        annEntry("2026-08-28", 9.25, 8.75, 9.75),
        futEntry("2026-08-27", 9.5),
        futEntry("2026-09-13", 9.6),
        futEntry("2026-09-21", 9.7),
      ]),
    );

    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent ===
          "Since last week — futures reference $9.70 on 21 Sept 2026, up $0.10 from $9.60 on 13 Sept 2026.",
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent ===
          "Since Fonterra's announcement — futures reference $9.70 on 21 Sept 2026, up $0.20 from $9.50 on 27 Aug 2026.",
      ),
    ).toBeDefined();
  });

  it("offers the section as a named landmark", () => {
    view(
      lastTradeSnapshot,
      FIXED_NOW,
      undefined,
      historyOf([futEntry("2026-09-13", 9.6), futEntry("2026-09-21", 9.7)]),
    );

    expect(screen.getByRole("region", { name: "What changed" })).toBeDefined();
  });

  it("words and colours a rising and a falling move, never colour alone", () => {
    view(
      lastTradeSnapshot,
      FIXED_NOW,
      undefined,
      historyOf([futEntry("2026-09-13", 9.5), futEntry("2026-09-21", 9.7)]),
    );
    expect(screen.getByText("up $0.20").className).toContain("changeDeltaUp");

    cleanup();
    view(
      lastTradeSnapshot,
      FIXED_NOW,
      undefined,
      historyOf([futEntry("2026-09-13", 9.9), futEntry("2026-09-21", 9.7)]),
    );
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent ===
          "Since last week — futures reference $9.70 on 21 Sept 2026, down $0.20 from $9.90 on 13 Sept 2026.",
      ),
    ).toBeDefined();
    expect(screen.getByText("down $0.20").className).toContain("changeDeltaDown");
  });

  it("words a repeated price as unchanged without colouring it", () => {
    view(
      lastTradeSnapshot,
      FIXED_NOW,
      undefined,
      historyOf([futEntry("2026-09-13", 9.7), futEntry("2026-09-21", 9.7)]),
    );

    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent ===
          "Since last week — futures reference $9.70 on 21 Sept 2026, unchanged from $9.70 on 13 Sept 2026.",
      ),
    ).toBeDefined();
    expect(screen.getByText("unchanged").className).not.toContain("changeDelta");
  });

  it("explains a basis change instead of comparing across it, once", () => {
    view(snapshot, FIXED_NOW, undefined, fixtureHistory);

    expect(
      screen.getAllByText(
        "The futures reference changed basis on 21 Sept 2026 (last trade → bid/offer midpoint), so values either side are not directly comparable.",
      ),
    ).toHaveLength(1);
  });

  it("names the official revision separately from futures moves", () => {
    view(snapshot, FIXED_NOW, undefined, fixtureHistory);

    expect(
      screen.getByText(
        "Fonterra forecast $9.50 on 21 Sept 2026, revised from $9.25 on 28 Aug 2026.",
      ),
    ).toBeDefined();
  });

  it("explains suppressed summaries with a stale check once the endpoint ages", () => {
    view(snapshot, Date.parse("2026-09-26T00:00:00Z"), undefined, fixtureHistory);

    expect(
      screen.getByText(
        "The current reference cannot be treated as fresh (a stale check), so no weekly comparison is shown.",
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        "The current reference cannot be treated as fresh (a stale check), so no announcement comparison is shown.",
      ),
    ).toBeDefined();
  });

  it("derives the retained cause from the check outcome", () => {
    view(
      {
        ...snapshot,
        checks: {
          official: {
            source: "official",
            checkedAt: "2026-09-23T06:00:00Z",
            outcome: "ok",
            detail: null,
          },
          futures: {
            source: "futures",
            checkedAt: "2026-09-23T06:00:00Z",
            outcome: "retained",
            detail: "unavailable:crossed",
          },
        },
      },
      FIXED_NOW,
      undefined,
      fixtureHistory,
    );

    expect(
      screen.getByText(
        "The current reference cannot be treated as fresh (a retained value), so no weekly comparison is shown.",
      ),
    ).toBeDefined();
  });

  it("derives the old-quote cause when checks are current", () => {
    view(
      {
        ...snapshot,
        checks: {
          official: {
            source: "official",
            checkedAt: "2026-09-25T22:00:00Z",
            outcome: "ok",
            detail: null,
          },
          futures: {
            source: "futures",
            checkedAt: "2026-09-25T22:00:00Z",
            outcome: "ok",
            detail: null,
          },
        },
      },
      Date.parse("2026-09-26T02:00:00Z"),
      undefined,
      fixtureHistory,
    );

    expect(
      screen.getByText(
        "The current reference cannot be treated as fresh (an old quote), so no weekly comparison is shown.",
      ),
    ).toBeDefined();
  });

  it("points at the first observation when history is too short", () => {
    view(
      snapshot,
      FIXED_NOW,
      undefined,
      historyOf([annEntry("2026-08-28", 9.25, 8.75, 9.75)]),
    );

    expect(
      screen.getByText(
        "Not enough collected history yet to compare with last week — observations begin 28 Aug 2026.",
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        "Not enough collected history yet to compare with Fonterra's announcement — observations begin 28 Aug 2026.",
      ),
    ).toBeDefined();
  });

  it("drops the begin clause when no observations exist at all", () => {
    view(snapshot, FIXED_NOW, undefined, null);

    expect(
      screen.getByText(
        "Not enough collected history yet to compare with last week.",
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent ===
          "Not enough collected history yet to compare with Fonterra's announcement.",
      ),
    ).toBeDefined();
  });

  it("frames a young season instead of naming missing history", () => {
    view(snapshot, Date.parse("2026-06-05T06:00:00Z"), undefined, historyOf([]));

    expect(
      screen.getAllByText(
        "A new season began on 1 June — changes compare within the 2026/27 season only.",
      ),
    ).toHaveLength(1);
  });

  it("shows no what-changed section without a snapshot", () => {
    view(null);

    expect(screen.queryByRole("region", { name: "What changed" })).toBeNull();
  });
});

describe("movement tiles", () => {
  const movementHistory = historyOf([
    annEntry("2026-08-28", 9.25, 8.75, 9.75),
    futEntry("2026-08-27", 9.4),
    futEntry("2026-09-13", 9.5),
    futEntry("2026-09-21", 9.7),
  ]);

  function enterProduction(value: string) {
    fireEvent.change(
      screen.getByLabelText("Expected full-season production, kgMS"),
      { target: { value } },
    );
  }

  it("turns each comparable period into a movement tile", () => {
    view(lastTradeSnapshot, FIXED_NOW, undefined, movementHistory);
    enterProduction("150000");

    expect(screen.getByText("Impact of the weekly move")).toBeDefined();
    expect(screen.getByText("Impact of the announcement move")).toBeDefined();
    // The futures-vs-official tile shares +NZ$30,000 at these prices.
    expect(screen.getAllByText("+NZ$30,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+NZ$30,000")[0].className).toContain("tileValueUp");
    expect(
      screen.getByText("+$0.20/kgMS since 13 Sept 2026 at your production"),
    ).toBeDefined();
    expect(screen.getByText("+NZ$45,000")).toBeDefined();
    expect(
      screen.getByText("+$0.30/kgMS since 27 Aug 2026 at your production"),
    ).toBeDefined();
  });

  it("updates the movement tiles as production changes", () => {
    view(lastTradeSnapshot, FIXED_NOW, undefined, movementHistory);
    enterProduction("150000");
    fireEvent.change(screen.getByRole("slider", { name: "Production slider" }), {
      target: { value: "200000" },
    });

    expect(screen.getAllByText("+NZ$40,000").length).toBeGreaterThan(0);
    expect(screen.getByText("+NZ$60,000")).toBeDefined();
  });

  it("keeps tiles absent for suppressed moves while scenarios stay editable", () => {
    view(snapshot, FIXED_NOW, undefined, fixtureHistory);
    enterProduction("150000");

    expect(screen.queryByRole("heading", { name: "What a move means for you" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Low price, NZD/kgMS"), {
      target: { value: "8" },
    });
    expect(screen.getByText("NZ$1,200,000")).toBeDefined();
  });

  it("shows NZ$0 movement tiles at zero production", () => {
    view(lastTradeSnapshot, FIXED_NOW, undefined, movementHistory);
    enterProduction("0");

    expect(screen.getByText("Impact of the weekly move")).toBeDefined();
    expect(screen.getByText("Impact of the announcement move")).toBeDefined();
    expect(screen.getAllByText("NZ$0")).toHaveLength(9);
  });
});
