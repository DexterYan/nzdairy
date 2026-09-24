// Task 17b: current-season history as a native SVG figure plus a dated table
// equivalent. Design §4: no charting library, no fabricated observations, and
// every plotted number also exists as text.
import { aucklandDateOf, aucklandDayStartMs } from "../lib/changes";
import type { EffectiveTime, HistoryEntry, SeasonHistory } from "../lib/history";
import styles from "./page.module.css";

const nzDate = new Intl.DateTimeFormat("en-NZ", {
  timeZone: "Pacific/Auckland",
  day: "numeric",
  month: "short",
  year: "numeric",
});

// en-NZ short months render September as "Sept"; §4's compact labels use "Sep".
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const BASIS_LABELS: Record<string, string> = {
  "bid-offer-midpoint": "bid/offer midpoint",
  "last-trade": "last trade",
  "prior-settlement": "prior settlement",
  announcement: "announcement",
};

const DAY_MS = 86_400_000;
const GAP_MS = 72 * 3_600_000;

// Aspect chosen so the figure lands near 14rem tall at a 375px viewport.
const VIEW_W = 600;
const VIEW_H = 392;
const PAD_LEFT = 44;
const PAD_RIGHT = 12;
const PAD_TOP = 24;
const PAD_BOTTOM = 30;

interface Plotted {
  entry: HistoryEntry;
  ms: number;
  value: number;
  low: number | null;
  high: number | null;
}

// Unverified instants are not price observations, so they are never plotted.
function effectiveMs(effective: EffectiveTime): number | null {
  if (effective.kind === "date") return aucklandDayStartMs(effective.on);
  return effective.verified ? Date.parse(effective.at) : null;
}

function plot(entry: HistoryEntry): Plotted | null {
  const ms = effectiveMs(entry.effective);
  const latest = entry.revisions[entry.revisions.length - 1];
  if (ms === null || latest === undefined) return null;
  return {
    entry,
    ms,
    value: latest.payload.value,
    low: latest.payload.low,
    high: latest.payload.high,
  };
}

export default function HistoryPanel({
  history,
  season,
  contract,
}: {
  history: SeasonHistory | null;
  season: string;
  // Unknown contract never excludes entries: history is season-scoped and
  // only the current-season contract is ever published into it.
  contract: string | null;
}) {
  const entries = history?.entries ?? [];
  const official = entries
    .filter((entry) => entry.series === "official-forecast")
    .map(plot)
    .filter((point): point is Plotted => point !== null)
    .sort((a, b) => a.ms - b.ms);
  const futures = entries
    .filter(
      (entry) =>
        entry.series === "mkp-futures" &&
        (contract === null || entry.market === contract),
    )
    .map(plot)
    .filter((point): point is Plotted => point !== null)
    .sort((a, b) => a.ms - b.ms);

  if (official.length === 0 && futures.length === 0) {
    return (
      <section className={styles.history} aria-labelledby="history-heading">
        <h2 id="history-heading" className={styles.cardTitle}>
          Season history
        </h2>
        <p className={styles.historyNote}>{emptySentence(season, entries)}</p>
        <p className={styles.historyNote}>
          See the current reference prices above for the latest values.
        </p>
      </section>
    );
  }

  const parsedYear = Number(season.slice(0, 4));
  const year = Number.isInteger(parsedYear) ? parsedYear : 2026;
  const xMin = aucklandDayStartMs(`${year}-06-01`);
  const xMax = Math.max(...official.map((p) => p.ms), ...futures.map((p) => p.ms));
  const plotW = VIEW_W - PAD_LEFT - PAD_RIGHT;
  const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  const xFor = (ms: number) =>
    PAD_LEFT + ((ms - xMin) / Math.max(xMax - xMin, 86_400_000)) * plotW;

  const values = [
    ...official.flatMap((p) => [p.value, p.low, p.high]),
    ...futures.map((p) => p.value),
  ].filter((value): value is number => value !== null);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 1e-9) {
    lo -= 0.25;
    hi += 0.25;
  }
  const yFor = (value: number) => PAD_TOP + ((hi - value) / (hi - lo)) * plotH;

  // Hairline gridlines at round values only — never more than five.
  const GRID_STEPS = [0.05, 0.1, 0.2, 0.25, 0.5, 1];
  const step =
    GRID_STEPS.find((candidate) => (hi - lo) / candidate <= 4) ?? 1;
  const gridlines: number[] = [];
  for (
    let value = Math.ceil(lo / step) * step;
    value <= hi + 1e-9;
    value += step
  ) {
    gridlines.push(Number(value.toFixed(4)));
  }

  // Month ticks at most every second month; §4's 375px legibility rule.
  // Ticks sit mid-month UTC so the instant falls inside the same calendar
  // month in both UTC and Pacific/Auckland.
  const months: { ms: number; label: string }[] = [];
  for (let month = 5; ; month += 1) {
    const calendarMonth = month % 12;
    const ms = Date.parse(
      `${year + Math.floor(month / 12)}-${String(calendarMonth + 1).padStart(2, "0")}-15T00:00:00Z`,
    );
    if (ms > xMax) break;
    months.push({ ms, label: MONTHS_SHORT[calendarMonth] });
  }
  const labelledMonths = months.filter((_, index) => index % 2 === 0);

  // Futures lines break at basis changes, provider changes and effective-time
  // gaps over 72 hours; each side stays its own segment.
  const segments: Plotted[][] = [];
  let current: Plotted[] = [];
  for (const point of futures) {
    const previous = current[current.length - 1];
    if (
      previous !== undefined &&
      (point.ms - previous.ms > GAP_MS ||
        point.entry.basis !== previous.entry.basis ||
        point.entry.provider !== previous.entry.provider)
    ) {
      segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length > 0) segments.push(current);
  const hasBand = official.some((p) => p.low !== null && p.high !== null);

  const rows = [...official, ...futures]
    .sort((a, b) => b.ms - a.ms || a.entry.identity.localeCompare(b.entry.identity))
    .map((point) => ({
      point,
      notes: notesFor(point, official, futures),
    }));

  return (
    <section className={styles.history} aria-labelledby="history-heading">
      <h2 id="history-heading" className={styles.cardTitle}>
        Season history
      </h2>
      <figure className={styles.historyFigure} role="img" aria-label={ariaSummary(official, futures)}>
        <svg
          className={styles.historySvg}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          aria-hidden="true"
        >
          {gridlines.map((value) => (
            <g key={value}>
              <line
                className={styles.historyGrid}
                x1={PAD_LEFT}
                x2={VIEW_W - PAD_RIGHT}
                y1={yFor(value)}
                y2={yFor(value)}
              />
              <text
                className={styles.historyAxis}
                x={PAD_LEFT - 6}
                y={yFor(value) + 4}
                textAnchor="end"
              >
                ${value.toFixed(2)}
              </text>
            </g>
          ))}
          <text className={styles.historyAxis} x={PAD_LEFT} y={12}>
            NZD/kgMS
          </text>
          {labelledMonths.map((month) => (
            <text
              key={month.ms}
              className={styles.historyMonth}
              x={xFor(month.ms)}
              y={VIEW_H - 8}
              textAnchor="middle"
            >
              {month.label}
            </text>
          ))}
          {official.map((point, index) => {
            const next = official[index + 1];
            const xEnd = xFor(next?.ms ?? xMax);
            if (point.low === null || point.high === null) return null;
            return (
              <g key={point.entry.identity}>
                <rect
                  className={styles.historyBand}
                  x={xFor(point.ms)}
                  y={yFor(point.high)}
                  width={xEnd - xFor(point.ms)}
                  height={yFor(point.low) - yFor(point.high)}
                />
                {/* Boundary ticks carry the published extent of the wash. */}
                <line
                  className={styles.historyTick}
                  x1={xFor(point.ms) - 4}
                  x2={xFor(point.ms) + 4}
                  y1={yFor(point.high)}
                  y2={yFor(point.high)}
                />
                <line
                  className={styles.historyTick}
                  x1={xFor(point.ms) - 4}
                  x2={xFor(point.ms) + 4}
                  y1={yFor(point.low)}
                  y2={yFor(point.low)}
                />
              </g>
            );
          })}
          {official.length > 0 && (
            <path
              className={styles.historyStep}
              d={stepPath(official, xFor, yFor, xMax)}
            />
          )}
          {/* One polyline per segment; a lone point draws no line — its
              circle carries the mark, the element keeps the count honest. */}
          {segments.map((segment, index) => (
            <polyline
              key={index}
              className={styles.historyLine}
              points={segment
                .map((point) => `${xFor(point.ms)},${yFor(point.value)}`)
                .join(" ")}
            />
          ))}
          {futures.map((point) => (
            <circle
              key={point.entry.identity}
              className={styles.historyPoint}
              cx={xFor(point.ms)}
              cy={yFor(point.value)}
              r={5}
            />
          ))}
          {valueLabels(official, futures, xFor, yFor).map((label, index) => (
            <text
              key={`${label.series}-${index}`}
              className={`${styles.historyValue} ${
                label.series === "official"
                  ? styles.historyValueOfficial
                  : styles.historyValueFutures
              }`}
              x={label.x}
              y={label.y}
              textAnchor="middle"
            >
              {label.text}
            </text>
          ))}
        </svg>
        {hasBand && (
          <figcaption className={styles.historyCaption}>
            The shaded band is the published forecast range, not a probability
            range.
          </figcaption>
        )}
      </figure>
      <details className={styles.historyDetails}>
        <summary className={styles.historySummary}>
          Show these observations as a table ({rows.length} observations)
        </summary>
        <table className={styles.historyTable}>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Series</th>
              <th scope="col">Value</th>
              <th scope="col">Basis</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ point, notes }) => (
              <tr key={point.entry.identity}>
                <td>{fullDate(point)}</td>
                <td>
                  {point.entry.series === "official-forecast"
                    ? "Official forecast"
                    : "Futures"}
                </td>
                <td>${point.value.toFixed(2)}</td>
                <td>{basisLabel(point.entry.basis)}</td>
                <td>{notes.length > 0 ? notes.join("; ") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function emptySentence(season: string, entries: HistoryEntry[]): string {
  const earliest = entries
    .map((entry) => effectiveMs(entry.effective))
    .filter((ms): ms is number => ms !== null)
    .sort((a, b) => a - b)[0];
  const begin =
    earliest === undefined
      ? null
      : nzDate.format(
          new Date(`${aucklandDateOf(earliest)}T00:00:00Z`),
        );
  return `History for the ${season} season is still building${
    begin === null ? "" : ` — observations begin ${begin}`
  }.`;
}

// Constant between dated announcements, stepping at each announcement date
// and holding to the right edge.
function stepPath(
  official: Plotted[],
  xFor: (ms: number) => number,
  yFor: (value: number) => number,
  xMax: number,
): string {
  const parts = official.map((point, index) => {
    const x = xFor(point.ms).toFixed(2);
    const y = yFor(point.value).toFixed(2);
    if (index === 0) return `M ${x} ${y}`;
    const previousY = yFor(official[index - 1].value).toFixed(2);
    return `L ${x} ${previousY} L ${x} ${y}`;
  });
  const last = official[official.length - 1];
  parts.push(`L ${xFor(xMax).toFixed(2)} ${yFor(last.value).toFixed(2)}`);
  return parts.join(" ");
}

// Only the first and latest point of each series carry a printed value.
function valueLabels(
  official: Plotted[],
  futures: Plotted[],
  xFor: (ms: number) => number,
  yFor: (value: number) => number,
): { series: "official" | "futures"; text: string; x: number; y: number }[] {
  const label = (series: "official" | "futures", point: Plotted) => ({
    series,
    text: `$${point.value.toFixed(2)}`,
    x: Math.min(Math.max(xFor(point.ms), PAD_LEFT + 16), VIEW_W - PAD_RIGHT - 16),
    y: Math.max(yFor(point.value) - 8, 12),
  });
  const ends = (series: "official" | "futures", points: Plotted[]) => {
    if (points.length === 0) return [];
    if (points.length === 1) return [label(series, points[0])];
    return [
      label(series, points[0]),
      label(series, points[points.length - 1]),
    ];
  };
  return [...ends("official", official), ...ends("futures", futures)];
}

function ariaSummary(official: Plotted[], futures: Plotted[]): string {
  const parts: string[] = [];
  if (futures.length > 0) {
    const first = futures[0];
    const last = futures[futures.length - 1];
    const min = Math.min(...futures.map((p) => p.value));
    const max = Math.max(...futures.map((p) => p.value));
    parts.push(
      `Futures observations from ${shortDate(first.ms)} to ${shortDate(last.ms)} between $${min.toFixed(2)} and $${max.toFixed(2)}`,
    );
  } else {
    parts.push("No futures observations yet");
  }
  if (official.length > 0) {
    const latest = official[official.length - 1];
    let clause = `forecast $${latest.value.toFixed(2)} since ${shortDate(latest.ms)}`;
    if (latest.low !== null && latest.high !== null) {
      clause += `, range $${latest.low.toFixed(2)}–$${latest.high.toFixed(2)}`;
    }
    parts.push(clause);
  }
  return `${parts.join("; ")}.`;
}

// Notes surface what the figure shows structurally: gaps, basis transitions
// and superseded revisions — the numbers behind the breaks.
function notesFor(point: Plotted, official: Plotted[], futures: Plotted[]): string[] {
  const notes: string[] = [];
  const series = point.entry.series === "official-forecast" ? official : futures;
  const index = series.indexOf(point);
  const previous = index > 0 ? series[index - 1] : undefined;
  // Announcements are dated events, so gaps between them are expected;
  // only futures observation coverage can actually go missing.
  if (
    point.entry.series === "mkp-futures" &&
    previous !== undefined &&
    point.ms - previous.ms > GAP_MS
  ) {
    notes.push(
      `no verified observation ${shortRange(
        previous.ms + DAY_MS,
        point.ms - DAY_MS,
      )}`,
    );
  }
  if (previous !== undefined && point.entry.basis !== previous.entry.basis) {
    notes.push(`basis changed to ${basisLabel(point.entry.basis)}`);
  }
  const revisions = point.entry.revisions;
  if (revisions.length > 1) {
    const prior = revisions[revisions.length - 2].payload.value;
    notes.push(`revised from $${prior.toFixed(2)}`);
  }
  if (point.entry.series === "official-forecast" && point.low !== null && point.high !== null) {
    notes.push(`range $${point.low.toFixed(2)}–$${point.high.toFixed(2)}`);
  }
  return notes;
}

function shortDate(ms: number): string {
  const date = new Date(`${aucklandDateOf(ms)}T00:00:00Z`);
  return `${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]}`;
}

// Same-month spans collapse to "17–20 Sep", per §4's gap-note example.
function shortRange(fromMs: number, toMs: number): string {
  const from = new Date(`${aucklandDateOf(fromMs)}T00:00:00Z`);
  const to = new Date(`${aucklandDateOf(toMs)}T00:00:00Z`);
  if (
    from.getUTCMonth() === to.getUTCMonth() &&
    from.getUTCFullYear() === to.getUTCFullYear()
  ) {
    return `${from.getUTCDate()}–${to.getUTCDate()} ${
      MONTHS_SHORT[to.getUTCMonth()]
    }`;
  }
  return `${shortDate(fromMs)}–${shortDate(toMs)}`;
}

function fullDate(point: Plotted): string {
  const effective = point.entry.effective;
  return effective.kind === "date"
    ? nzDate.format(new Date(`${effective.on}T00:00:00Z`))
    : nzDate.format(new Date(effective.at));
}

function basisLabel(basis: string): string {
  return BASIS_LABELS[basis] ?? basis;
}
