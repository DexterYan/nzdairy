import { beforeEach, describe, expect, it } from "vitest";
import {
  clearScenarios,
  loadScenarios,
  saveScenarios,
  scenariosFromOfficial,
  storageKey,
  type ScenarioState,
} from "../lib/scenarios";
import type { OfficialForecast } from "../lib/snapshot";

const official: OfficialForecast = {
  midpoint: 9.5,
  low: 8.5,
  high: 10.5,
  rangeSource: "inline",
  announcedAt: "2026-09-21T13:00:00Z",
  noChangeUpdate: null,
  currency: "NZD",
  unit: "NZD/kgMS",
  sourceUrl: "https://www.fonterra.com/nz/en/investors/farmgate",
  retrievedAt: "2026-09-23T06:00:12Z",
  status: "ok",
};

const partial: OfficialForecast = {
  ...official,
  low: null,
  high: null,
  rangeSource: "none",
};

// jsdom's localStorage is a real implementation; clear it between tests.
beforeEach(() => {
  window.localStorage.clear();
});

describe("scenariosFromOfficial", () => {
  it("initialises the three scenarios from the published range", () => {
    expect(scenariosFromOfficial(official)).toEqual({
      low: "8.5",
      midpoint: "9.5",
      high: "10.5",
    });
  });

  it("leaves missing range endpoints blank instead of inventing values", () => {
    expect(scenariosFromOfficial(partial)).toEqual({
      low: "",
      midpoint: "9.5",
      high: "",
    });
  });
});

describe("storageKey", () => {
  it("scopes saved scenarios to the season", () => {
    expect(storageKey("2026/27")).toBe("milkcompass:scenarios:2026/27");
    expect(storageKey("2027/28")).not.toBe(storageKey("2026/27"));
  });
});

describe("loadScenarios", () => {
  it("falls back to the official values when nothing is saved", () => {
    expect(loadScenarios(window.localStorage, "2026/27", official)).toEqual({
      low: "8.5",
      midpoint: "9.5",
      high: "10.5",
    });
  });

  it("returns saved edits instead of newer official values", () => {
    const saved: ScenarioState = { low: "8", midpoint: "9", high: "11" };
    saveScenarios(window.localStorage, "2026/27", saved);

    const loaded = loadScenarios(window.localStorage, "2026/27", {
      ...official,
      midpoint: 9.6,
      low: 8.6,
      high: 10.6,
    });

    expect(loaded).toEqual(saved);
  });

  it("does not read another season's saved scenarios", () => {
    saveScenarios(window.localStorage, "2026/27", {
      low: "8",
      midpoint: "9",
      high: "11",
    });

    expect(loadScenarios(window.localStorage, "2027/28", official)).toEqual({
      low: "8.5",
      midpoint: "9.5",
      high: "10.5",
    });
  });

  it("falls back to the official values for corrupt saved JSON", () => {
    window.localStorage.setItem(storageKey("2026/27"), "{not json");

    expect(loadScenarios(window.localStorage, "2026/27", official)).toEqual(
      scenariosFromOfficial(official),
    );
  });

  it("falls back when the saved shape is wrong", () => {
    window.localStorage.setItem(
      storageKey("2026/27"),
      JSON.stringify({ low: 8, midpoint: 9, high: 10 }),
    );

    expect(loadScenarios(window.localStorage, "2026/27", official)).toEqual(
      scenariosFromOfficial(official),
    );
  });

  it("falls back safely when storage access is blocked", () => {
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

    expect(loadScenarios(blocked, "2026/27", official)).toEqual(
      scenariosFromOfficial(official),
    );
  });

  it("falls back safely when storage itself is unavailable", () => {
    expect(loadScenarios(null, "2026/27", official)).toEqual(
      scenariosFromOfficial(official),
    );
  });
});

describe("saveScenarios", () => {
  it("persists the scenarios under the season key", () => {
    saveScenarios(window.localStorage, "2026/27", {
      low: "8",
      midpoint: "9",
      high: "11",
    });

    expect(
      window.localStorage.getItem("milkcompass:scenarios:2026/27"),
    ).toBe(JSON.stringify({ low: "8", midpoint: "9", high: "11" }));
  });

  it("swallows blocked-storage failures so editing never crashes", () => {
    const blocked: Storage = {
      length: 0,
      clear: () => {},
      key: () => null,
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };

    expect(() =>
      saveScenarios(blocked, "2026/27", scenariosFromOfficial(official)),
    ).not.toThrow();
  });
});

describe("clearScenarios", () => {
  it("removes the saved scenarios for the season", () => {
    saveScenarios(window.localStorage, "2026/27", {
      low: "8",
      midpoint: "9",
      high: "11",
    });
    clearScenarios(window.localStorage, "2026/27");

    expect(window.localStorage.getItem("milkcompass:scenarios:2026/27")).toBeNull();
  });

  it("swallows blocked-storage failures", () => {
    const blocked: Storage = {
      length: 0,
      clear: () => {},
      key: () => null,
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new Error("blocked");
      },
    };

    expect(() => clearScenarios(blocked, "2026/27")).not.toThrow();
  });
});
