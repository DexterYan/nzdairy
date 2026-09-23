"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatRevenue,
  grossRevenue,
  parsePriceInput,
  parseProduction,
  priceSensitivity,
} from "../lib/calculator";
import {
  clearScenarios,
  loadScenarios,
  saveScenarios,
  scenariosFromOfficial,
  type ScenarioKey,
  type ScenarioState,
} from "../lib/scenarios";
import type { FuturesBlock, OfficialForecast } from "../lib/snapshot";
import styles from "./page.module.css";

const GUIDANCE = {
  blank: "Enter your expected full-season production in kgMS to see your revenue.",
  "not-a-number": "Enter production as a plain number in kgMS, like 150000.",
  "too-precise": "Use at most two decimal places for production.",
} as const;

const PRICE_GUIDANCE = "Use a plain number with at most three decimal places.";

const SCENARIOS: { key: ScenarioKey; label: string }[] = [
  { key: "low", label: "Low price, NZD/kgMS" },
  { key: "midpoint", label: "Midpoint price, NZD/kgMS" },
  { key: "high", label: "High price, NZD/kgMS" },
];

export default function RevenuePanel({
  official,
  futures,
  season,
  storage,
}: {
  official: OfficialForecast;
  futures?: FuturesBlock;
  season: string;
  storage?: Storage | null;
}) {
  const resolvedStorage = useMemo(() => resolveStorage(storage), [storage]);
  const [raw, setRaw] = useState("");
  const [scenarios, setScenarios] = useState<ScenarioState>(() =>
    scenariosFromOfficial(official),
  );

  // Load saved edits after mount so hydrated markup matches the server render.
  // A microtask keeps the refresh out of the commit (react-hooks/set-state-in-effect).
  useEffect(() => {
    queueMicrotask(() => {
      setScenarios(loadScenarios(resolvedStorage, season, official));
    });
  }, [resolvedStorage, season, official]);

  const parsed = parseProduction(raw);
  const production = parsed.kind === "valid" ? parsed.value : null;

  const officialRevenue =
    production === null ? null : grossRevenue(production, official.midpoint);
  const futuresQuote = futures?.status === "ok" ? futures : null;
  const futuresRevenue =
    production === null || futuresQuote === null
      ? null
      : grossRevenue(production, futuresQuote.price);
  // Valid input can still overflow the multiplication; never render it.
  const overflow =
    (officialRevenue !== null && !Number.isFinite(officialRevenue)) ||
    (futuresRevenue !== null && !Number.isFinite(futuresRevenue));

  const updateScenario = (key: ScenarioKey, value: string) => {
    const next = { ...scenarios, [key]: value };
    setScenarios(next);
    saveScenarios(resolvedStorage, season, next);
  };

  const resetScenarios = () => {
    clearScenarios(resolvedStorage, season);
    setScenarios(scenariosFromOfficial(official));
  };

  return (
    <section className={styles.revenue} aria-labelledby="revenue-heading">
      <h2 id="revenue-heading" className={styles.cardTitle}>
        Your gross milk revenue
      </h2>
      <div className={styles.fieldRow}>
        <label className={styles.fieldLabel} htmlFor="production">
          Expected full-season production, kgMS
        </label>
        <input
          id="production"
          className={styles.input}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
        />
        <button
          type="button"
          className={styles.exampleButton}
          onClick={() => setRaw("150000")}
        >
          Use 150,000 kgMS as an example
        </button>
      </div>
      {production === null ? (
        <p className={styles.guidance}>
          {parsed.kind === "invalid" ? GUIDANCE[parsed.reason] : GUIDANCE.blank}
        </p>
      ) : overflow ? (
        <p className={styles.guidance}>
          This production is too large to calculate.
        </p>
      ) : (
        <dl className={styles.results}>
          <div className={styles.resultRow}>
            <dt>Official forecast revenue</dt>
            <dd>{formatRevenue(officialRevenue as number)}</dd>
          </div>
          {futuresRevenue === null ? (
            <div className={styles.resultRow}>
              <dt>Futures reference revenue</dt>
              <dd>Futures revenue is unavailable right now.</dd>
            </div>
          ) : (
            <>
              <div className={styles.resultRow}>
                <dt>Futures reference revenue</dt>
                <dd>{formatRevenue(futuresRevenue)}</dd>
              </div>
              <div className={styles.resultRow}>
                <dt>Futures versus official forecast</dt>
                <dd>{differenceLine(futuresRevenue, officialRevenue as number)}</dd>
              </div>
            </>
          )}
          <div className={styles.resultRow}>
            <dt>Sensitivity to a $0.50/kgMS price change</dt>
            <dd>{formatRevenue(priceSensitivity(production))}</dd>
          </div>
        </dl>
      )}
      <h3 className={styles.scenarioTitle}>Three price scenarios</h3>
      <div className={styles.scenarios}>
        {SCENARIOS.map(({ key, label }) => {
          const parsedPrice = parsePriceInput(scenarios[key]);
          const revenue =
            production !== null && parsedPrice.kind === "valid"
              ? grossRevenue(production, parsedPrice.value)
              : null;
          return (
            <div className={styles.scenarioRow} key={key}>
              <label className={styles.fieldLabel} htmlFor={`scenario-${key}`}>
                {label}
              </label>
              <input
                id={`scenario-${key}`}
                className={styles.scenarioInput}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={scenarios[key]}
                onChange={(event) => updateScenario(key, event.target.value)}
              />
              {parsedPrice.kind === "invalid" ? (
                <span className={styles.scenarioGuidance}>{PRICE_GUIDANCE}</span>
              ) : (
                <span className={styles.scenarioRevenue}>
                  {revenue !== null && Number.isFinite(revenue)
                    ? formatRevenue(revenue)
                    : ""}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className={styles.exampleButton}
        onClick={resetScenarios}
      >
        Reset scenarios to Fonterra&apos;s published values
      </button>
      <p className={styles.assumptions}>
        Figures are gross full-season milk revenue in New Zealand dollars,
        rounded to the nearest dollar. They exclude GST, costs, dividends,
        premiums, deductions, and payment timing.
      </p>
    </section>
  );
}

function differenceLine(futuresRevenue: number, officialRevenue: number): string {
  const difference = futuresRevenue - officialRevenue;
  // Below half a dollar the rounded figures show no difference at all.
  if (Math.abs(difference) < 0.5) {
    return "The revenue difference rounds to NZ$0.";
  }
  const direction = difference > 0 ? "above" : "below";
  return `${formatRevenue(Math.abs(difference))} ${direction} the official forecast`;
}

function resolveStorage(explicit: Storage | null | undefined): Storage | null {
  if (explicit !== undefined) return explicit;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
