"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

// Slider bounds are interaction bounds only — parseProduction still accepts
// any non-negative plain number, and typed text is never rewritten by parking.
const SLIDER_MIN = 20_000;
const SLIDER_MAX = 500_000;
const SLIDER_STEP = 1_000;
const SLIDER_ANCHOR = 150_000;

const parkToStop = (value: number) =>
  Math.min(
    SLIDER_MAX,
    Math.max(SLIDER_MIN, Math.round(value / SLIDER_STEP) * SLIDER_STEP),
  );

// A validated change from the what-changed section, ready to translate into
// revenue at the user's production. Read-only: production state stays here.
export interface Movement {
  label: string;
  delta: number;
  since: string;
}

export default function RevenuePanel({
  official,
  futures,
  season,
  storage,
  movements,
}: {
  official: OfficialForecast;
  futures?: FuturesBlock;
  season: string;
  storage?: Storage | null;
  movements?: Movement[];
}) {
  const resolvedStorage = useMemo(() => resolveStorage(storage), [storage]);
  const [raw, setRaw] = useState("");
  const [scenarios, setScenarios] = useState<ScenarioState>(() =>
    scenariosFromOfficial(official),
  );
  // Edits made this session win over any reload, even when the save failed;
  // a superseded deferred load must never apply.
  const dirtyRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const loadedSeasonRef = useRef<string | null>(null);
  // Where the thumb parks while the text is blank or invalid: the last value
  // the user actually had, or the example anchor before any valid entry.
  const [lastValidProduction, setLastValidProduction] = useState<number | null>(
    null,
  );

  // Load saved edits after mount so hydrated markup matches the server render.
  // A microtask keeps the refresh out of the commit (react-hooks/set-state-in-effect).
  useEffect(() => {
    const generation = ++loadGenerationRef.current;
    if (loadedSeasonRef.current !== season) {
      loadedSeasonRef.current = season;
      dirtyRef.current = false;
    }
    queueMicrotask(() => {
      if (generation !== loadGenerationRef.current || dirtyRef.current) return;
      setScenarios(loadScenarios(resolvedStorage, season, official));
    });
  }, [resolvedStorage, season, official]);

  const parsed = parseProduction(raw);
  const production = parsed.kind === "valid" ? parsed.value : null;

  // raw changes only through user events, so the last valid production is
  // recorded at the write sites — no render-time or effect-time state sync.
  const updateProduction = (next: string) => {
    setRaw(next);
    const parsedNext = parseProduction(next);
    if (parsedNext.kind === "valid") setLastValidProduction(parsedNext.value);
  };

  const thumbValue =
    production !== null
      ? parkToStop(production)
      : lastValidProduction === null
        ? SLIDER_ANCHOR
        : parkToStop(lastValidProduction);

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
    dirtyRef.current = true;
    const next = { ...scenarios, [key]: value };
    setScenarios(next);
    saveScenarios(resolvedStorage, season, next);
  };

  const resetScenarios = () => {
    clearScenarios(resolvedStorage, season);
    dirtyRef.current = false;
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
          aria-invalid={parsed.kind === "invalid" || undefined}
          aria-describedby={
            parsed.kind === "invalid" ? "production-guidance" : undefined
          }
          value={raw}
          onChange={(event) => updateProduction(event.target.value)}
        />
        <button
          type="button"
          className={styles.exampleButton}
          onClick={() => updateProduction("150000")}
        >
          Use 150,000 kgMS as an example
        </button>
      </div>
      <div className={styles.sliderRow}>
        <input
          className={styles.slider}
          type="range"
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={SLIDER_STEP}
          value={thumbValue}
          aria-label="Production slider"
          aria-describedby="production-slider-note"
          onChange={(event) => updateProduction(event.target.value)}
        />
        <p id="production-slider-note" className={styles.visuallyHidden}>
          Moves in 1,000 kgMS steps. Its position is approximate outside
          20,000 to 500,000 kgMS; the text field holds the exact value.
        </p>
      </div>
      {production === null ? (
        <p
          className={styles.guidance}
          id={parsed.kind === "invalid" ? "production-guidance" : undefined}
        >
          {parsed.kind === "invalid" ? GUIDANCE[parsed.reason] : GUIDANCE.blank}
        </p>
      ) : overflow ? (
        <p className={styles.guidance}>
          This production is too large to calculate.
        </p>
      ) : (
        <>
          <dl className={styles.tiles}>
            <div className={styles.tile}>
              <dt className={styles.tileLabel}>Official forecast revenue</dt>
              <dd className={styles.tileValue}>
                {formatRevenue(officialRevenue as number)}
              </dd>
              <dd className={styles.tileCaption}>
                at ${official.midpoint.toFixed(2)} /kgMS
              </dd>
            </div>
            {futuresRevenue === null ? (
              <div className={styles.tileGuidance}>
                <dt className={styles.tileLabel}>Futures reference revenue</dt>
                <dd>Futures revenue is unavailable right now.</dd>
              </div>
            ) : (
              <>
                <div className={styles.tile}>
                  <dt className={styles.tileLabel}>Futures reference revenue</dt>
                  <dd className={styles.tileValue}>{formatRevenue(futuresRevenue)}</dd>
                  <dd className={styles.tileCaption}>
                    at ${futuresQuote?.price.toFixed(2)} /kgMS
                  </dd>
                </div>
                <DeltaTile
                  futuresRevenue={futuresRevenue}
                  officialRevenue={officialRevenue as number}
                />
              </>
            )}
            <div className={styles.tile}>
              <dt className={styles.tileLabel}>$0.50/kgMS sensitivity</dt>
              <dd className={styles.tileValue}>
                {formatRevenue(priceSensitivity(production))}
              </dd>
              <dd className={styles.tileCaption}>per $0.50 move</dd>
            </div>
          </dl>
          {movements !== undefined && movements.length > 0 && (
            <>
              <h3 className={styles.scenarioTitle}>What a move means for you</h3>
              <dl className={styles.tiles}>
                {movements.map((movement) => (
                  <MovementTile
                    key={movement.label}
                    movement={movement}
                    production={production}
                  />
                ))}
              </dl>
            </>
          )}
        </>
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
                aria-invalid={parsedPrice.kind === "invalid" || undefined}
                aria-describedby={
                  parsedPrice.kind === "invalid"
                    ? `scenario-${key}-guidance`
                    : undefined
                }
                value={scenarios[key]}
                onChange={(event) => updateScenario(key, event.target.value)}
              />
              {parsedPrice.kind === "invalid" ? (
                <span
                  className={styles.scenarioGuidance}
                  id={`scenario-${key}-guidance`}
                >
                  {PRICE_GUIDANCE}
                </span>
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

// The signed-value contract: sign, word, and colour carry direction — never
// colour alone; below half a dollar the rounded figure shows NZ$0.
function SignedTile({
  label,
  difference,
  captionFor,
}: {
  label: string;
  difference: number;
  captionFor: (up: boolean) => string;
}) {
  if (Math.abs(difference) < 0.5) {
    return (
      <div className={styles.tile}>
        <dt className={styles.tileLabel}>{label}</dt>
        <dd className={styles.tileValue}>{formatRevenue(0)}</dd>
        <dd className={styles.tileCaption}>
          The revenue difference rounds to NZ$0.
        </dd>
      </div>
    );
  }
  const up = difference > 0;
  return (
    <div className={styles.tile}>
      <dt className={styles.tileLabel}>{label}</dt>
      <dd
        className={`${styles.tileValue} ${
          up ? styles.tileValueUp : styles.tileValueDown
        }`}
      >
        {up ? "+" : "-"}
        {formatRevenue(Math.abs(difference))}
      </dd>
      <dd className={styles.tileCaption}>{captionFor(up)}</dd>
    </div>
  );
}

function DeltaTile({
  futuresRevenue,
  officialRevenue,
}: {
  futuresRevenue: number;
  officialRevenue: number;
}) {
  return (
    <SignedTile
      label="Futures vs official"
      difference={futuresRevenue - officialRevenue}
      captionFor={(up) => `${up ? "above" : "below"} the official forecast`}
    />
  );
}

function MovementTile({
  movement,
  production,
}: {
  movement: Movement;
  production: number;
}) {
  const magnitude = grossRevenue(production, Math.abs(movement.delta));
  return (
    <SignedTile
      label={movement.label}
      difference={movement.delta > 0 ? magnitude : -magnitude}
      captionFor={(up) =>
        `${up ? "+" : "-"}$${Math.abs(movement.delta).toFixed(2)}/kgMS since ${movement.since} at your production`
      }
    />
  );
}

function resolveStorage(explicit: Storage | null | undefined): Storage | null {
  if (explicit !== undefined) return explicit;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
