import { freshness } from "../lib/freshness";
import { labelEdge, stripAria, stripScale } from "../lib/comparison-scale";
import type { FuturesBlock, OfficialForecast } from "../lib/snapshot";
import styles from "./page.module.css";

// Pure-CSS figure: no charting library. The wash fill is decorative; the
// solid boundary ticks carry the range extent (docs/design.md §4.3).
export default function ComparisonStrip({
  official,
  futures,
  now,
}: {
  official: OfficialForecast;
  futures?: FuturesBlock;
  now: number;
}) {
  const futuresQuote = futures?.status === "ok" ? futures : null;
  const inputs = {
    midpoint: official.midpoint,
    low: official.low,
    high: official.high,
    futures: futuresQuote?.price ?? null,
  };
  const scale = stripScale(inputs);
  const aria = stripAria(inputs);
  if (scale === null || aria === null) return null;

  // The 72-hour rule re-evaluates at request time so retained quotes age.
  const { quoteOld } = futuresQuote
    ? freshness(futuresQuote.quotedAt, futuresQuote.retrievedAt, now)
    : { quoteOld: false };
  const futuresLabel =
    futuresQuote === null
      ? null
      : `Futures $${futuresQuote.price.toFixed(2)}${quoteOld ? " · old quote" : ""}`;

  const edgeClass = (edge: "left" | "center" | "right") =>
    edge === "left"
      ? styles.edgeLeft
      : edge === "right"
        ? styles.edgeRight
        : undefined;
  const at = (fraction: number) => ({ left: `${fraction * 100}%` });
  const money = (value: number) => `$${value.toFixed(2)}`;

  return (
    <figure className={styles.strip} role="img" aria-label={aria}>
      <div className={styles.stripWrap}>
        <div className={styles.stripTrack} />
        {official.low !== null && official.high !== null && scale.rangeMinFraction !== null && scale.rangeMaxFraction !== null && (
          <div
            className={styles.stripFill}
            style={{
              left: `${scale.rangeMinFraction * 100}%`,
              width: `${(scale.rangeMaxFraction - scale.rangeMinFraction) * 100}%`,
            }}
          />
        )}
        {scale.ticks.map((tick) => (
          <span
            key={`tick-${tick.value}`}
            className={styles.stripTick}
            style={at(tick.fraction)}
          />
        ))}
        <span
          className={`${styles.stripMarker} ${styles.stripMarkerOfficial}`}
          style={at(scale.officialFraction)}
        />
        {scale.futuresFraction !== null && (
          <span
            className={`${styles.stripMarker} ${styles.stripMarkerFutures}`}
            style={at(scale.futuresFraction)}
          />
        )}
        <span
          className={`${styles.stripLabel} ${styles.stripLabelOfficial} ${edgeClass(labelEdge(scale.officialFraction)) ?? ""}`}
          style={at(scale.officialFraction)}
        >
          Official ${official.midpoint.toFixed(2)}
        </span>
        {futuresLabel !== null && scale.futuresFraction !== null && (
          <span
            className={`${styles.stripLabel} ${styles.stripLabelFutures} ${edgeClass(labelEdge(scale.futuresFraction)) ?? ""}`}
            style={at(scale.futuresFraction)}
          >
            {futuresLabel}
          </span>
        )}
        {scale.ticks.map((tick) => (
          <span
            key={`tick-label-${tick.value}`}
            className={`${styles.stripLabel} ${styles.stripTickLabel} ${edgeClass(tick.edge) ?? ""}`}
            style={at(tick.fraction)}
          >
            {money(tick.value)}
          </span>
        ))}
      </div>
      {futuresQuote !== null && (
        <figcaption className={styles.stripKey}>
          <span className={styles.dotOfficial} aria-hidden="true" />
          <span>Official forecast</span>
          <span className={styles.dotFutures} aria-hidden="true" />
          <span>NZX futures</span>
        </figcaption>
      )}
    </figure>
  );
}
