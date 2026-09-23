"use client";

import { useState } from "react";
import {
  formatRevenue,
  grossRevenue,
  parseProduction,
  priceSensitivity,
} from "../lib/calculator";
import type { FuturesBlock, OfficialForecast } from "../lib/snapshot";
import styles from "./page.module.css";

const GUIDANCE = {
  blank: "Enter your expected full-season production in kgMS to see your revenue.",
  "not-a-number": "Enter production as a plain number in kgMS, like 150000.",
  "too-precise": "Use at most two decimal places for production.",
} as const;

export default function RevenuePanel({
  official,
  futures,
}: {
  official: OfficialForecast;
  futures?: FuturesBlock;
}) {
  const [raw, setRaw] = useState("");
  const parsed = parseProduction(raw);
  const production = parsed.kind === "valid" ? parsed.production : null;

  const officialRevenue =
    production === null ? null : grossRevenue(production, official.midpoint);
  const futuresQuote = futures?.status === "ok" ? futures : null;
  const futuresRevenue =
    production === null || futuresQuote === null
      ? null
      : grossRevenue(production, futuresQuote.price);

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
  if (Math.abs(difference) < 0.5) {
    return "The futures reference matches the official forecast.";
  }
  const direction = difference > 0 ? "above" : "below";
  return `${formatRevenue(Math.abs(difference))} ${direction} the official forecast`;
}
