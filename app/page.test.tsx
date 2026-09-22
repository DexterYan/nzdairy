import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import fixture from "../fixtures/latest-snapshot.json";
import type { MilkSnapshot } from "../lib/snapshot";
import ComparisonView from "./comparison-view";

afterEach(cleanup);

const snapshot = fixture as unknown as MilkSnapshot;

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

  it("shows the last successful source check", () => {
    view();

    expect(screen.getByText("Checked 23 Sept 2026")).toBeDefined();
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
  it("states that the futures reference arrives in a later release", () => {
    view();

    expect(
      screen.getByText("Futures reference arrives in a later release."),
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
