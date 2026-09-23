import {
  aucklandDateOf,
  aucklandDayStartMs,
  futuresChanges,
  officialRevision,
  type ChangeOutcome,
  type ObservationPoint,
  type OfficialRevision,
} from "../lib/changes";
import type { SeasonHistory } from "../lib/history";
import { Fragment, type ReactNode } from "react";
import { freshness } from "../lib/freshness";
import type { ReadProvenance } from "../lib/release";
import type {
  FuturesBlock,
  FuturesReason,
  MilkSnapshot,
  QuoteBasis,
  SourceCheck,
} from "../lib/snapshot";
import ComparisonStrip from "./comparison-strip";
import RevenuePanel, { type Movement } from "./revenue-panel";
import styles from "./page.module.css";

const nzDate = new Intl.DateTimeFormat("en-NZ", {
  timeZone: "Pacific/Auckland",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const nzDateTime = new Intl.DateTimeFormat("en-NZ", {
  timeZone: "Pacific/Auckland",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const nzInt = new Intl.NumberFormat("en-NZ");

const BASIS_TAGS: Record<QuoteBasis, string> = {
  "bid-offer-midpoint": "MIDPOINT",
  "last-trade": "LAST TRADE",
  "prior-settlement": "PRIOR SETTLE",
};

// Human labels for transition sentences; unknown bases keep their stored id.
const BASIS_LABELS: Record<string, string> = {
  "bid-offer-midpoint": "bid/offer midpoint",
  "last-trade": "last trade",
  "prior-settlement": "prior settlement",
};

export default function ComparisonView({
  snapshot,
  nowMs,
  provenance = "unknown",
  history,
}: {
  snapshot: MilkSnapshot | null;
  nowMs?: number;
  // Absent provenance is the legacy path: unknown, never guessed live.
  provenance?: ReadProvenance;
  // Legacy reads have no history; comparisons then explain themselves.
  history?: SeasonHistory | null;
}) {
  // Staleness is a display rule evaluated at request time, so retained data
  // keeps aging even while the collector fails.
  // Request-time clock is sound here: force-dynamic server component.
  // eslint-disable-next-line react-hooks/purity
  const now = nowMs ?? Date.now();
  const changes = futuresChanges({
    history: history ?? null,
    snapshot,
    nowMs: now,
  });
  const revision = officialRevision(history ?? null);
  const movements =
    changes === null
      ? undefined
      : [
          movementOf("Impact of the weekly move", changes.weekly),
          movementOf("Impact of the announcement move", changes.sinceAnnouncement),
        ].filter((movement): movement is Movement => movement !== null);
  return (
    <div className={styles.page}>
      <div className={styles.band}>
        <div className={styles.bandInner}>
          <header className={styles.banner}>
            <p className={styles.brand}>MilkCompass</p>
            {snapshot && (
              <p className={`${styles.chip} ${styles.chipOkOfficial}`}>
                {snapshot.season} season
              </p>
            )}
          </header>
          <h1>What does the milk price mean for your farm?</h1>
          <p className={styles.lede}>
            Compare today&apos;s reference prices and explore your revenue.
          </p>
        </div>
      </div>
      <main className={styles.main}>
        {snapshot ? (
          <>
            <ComparisonCards snapshot={snapshot} now={now} />
            <WhatChanged
              changes={changes}
              revision={revision}
              snapshot={snapshot}
              now={now}
            />
            <RevenuePanel
              official={snapshot.official}
              futures={snapshot.futures}
              season={snapshot.season}
              movements={movements}
            />
          </>
        ) : (
          <p className={styles.unavailable}>
            Reference prices are unavailable right now.
          </p>
        )}
      </main>
      <footer className={styles.footer}>
        <p className={styles.credits}>
          <span className={styles.dotOfficial} aria-hidden="true" />
          Fonterra forecast
          {" · "}
          <span className={styles.dotFutures} aria-hidden="true" />
          NZX futures
        </p>
        <p>{footerNotice(provenance, snapshot)}</p>
      </footer>
    </div>
  );
}

function ComparisonCards({ snapshot, now }: { snapshot: MilkSnapshot; now: number }) {
  const { official } = snapshot;
  const hasRange = official.low !== null && official.high !== null;

  return (
    <section aria-label="Price comparison">
      <div className={styles.comparison}>
        <article className={styles.card} aria-labelledby="official-heading">
        <h2 id="official-heading" className={styles.cardTitle}>
          Fonterra forecast
        </h2>
        <div className={styles.priceRow}>
          <p className={styles.price}>
            ${official.midpoint.toFixed(2)}{" "}
            <span className={styles.unit}>/kgMS</span>
          </p>
          <span className={`${styles.tag} ${styles.tagOfficial}`}>FORECAST</span>
        </div>
        <p className={styles.meta}>
          {hasRange
            ? `Range $${official.low?.toFixed(2)}-$${official.high?.toFixed(2)} /kgMS`
            : "No published range"}
        </p>
        <p className={styles.meta}>
          Announced {nzDate.format(new Date(official.announcedAt))}
        </p>
        {official.noChangeUpdate && (
          <p className={styles.meta}>
            Latest update {nzDate.format(new Date(official.noChangeUpdate.date))}:
            no change
          </p>
        )}
        <ChipRow
          warnings={cardWarnings(snapshot.checks?.official, official.retrievedAt, now)}
          variant="official"
        />
        <p className={styles.meta}>
          Checked {nzDate.format(new Date(official.retrievedAt))}
        </p>
        <a className={styles.sourceLink} href={official.sourceUrl}>
          View official source
        </a>
        </article>
        <article className={styles.card} aria-labelledby="futures-heading">
          <h2 id="futures-heading" className={styles.cardTitle}>
            Futures reference
          </h2>
          <FuturesCard
            futures={snapshot.futures}
            check={snapshot.checks?.futures}
            season={snapshot.season}
            collectedAt={snapshot.collectedAt}
            now={now}
          />
        </article>
      </div>
      <ComparisonStrip
        official={snapshot.official}
        futures={snapshot.futures}
        now={now}
      />
    </section>
  );
}

// Warnings are independent predicates; the reassuring chip only renders when
// none apply, so "up to date" can never sit beside a warning on the same card.
function cardWarnings(
  check: SourceCheck | undefined,
  retrievedAt: string,
  now: number,
): string[] {
  const { checkStale } = freshness(null, check?.checkedAt ?? retrievedAt, now);
  const warnings: string[] = [];
  if (check && check.outcome !== "ok") {
    warnings.push(
      `The latest collection on ${nzDate.format(new Date(check.checkedAt))} failed — showing the previous value.`,
    );
  }
  if (checkStale) {
    warnings.push("The last check is more than 36 hours old.");
  }
  return warnings;
}

function ChipRow({
  warnings,
  variant,
}: {
  warnings: string[];
  variant: "official" | "futures";
}) {
  if (warnings.length === 0) {
    return (
      <p
        className={`${styles.chip} ${
          variant === "official" ? styles.chipOkOfficial : styles.chipOkFutures
        }`}
      >
        Up to date
      </p>
    );
  }
  return (
    <>
      {warnings.map((warning) => (
        <p key={warning} className={`${styles.chip} ${styles.chipWarn}`}>
          {warning}
        </p>
      ))}
    </>
  );
}

// An unavailable reference still shows when it was last checked, so a stalled
// collector is visible even with nothing to price.
function CheckAge({
  check,
  fallbackAt,
  now,
}: {
  check?: SourceCheck;
  fallbackAt: string;
  now: number;
}) {
  const checkedAt = check?.checkedAt ?? fallbackAt;
  const { checkStale } = freshness(null, checkedAt, now);
  return (
    <>
      <p className={styles.meta}>Checked {nzDate.format(new Date(checkedAt))}</p>
      {checkStale && (
        <p className={styles.warning}>The last check is more than 36 hours old.</p>
      )}
    </>
  );
}

function FuturesCard({
  futures,
  check,
  season,
  collectedAt,
  now,
}: {
  futures: FuturesBlock | undefined;
  check?: SourceCheck;
  season: string;
  collectedAt: string;
  now: number;
}) {
  if (futures === undefined || futures.status === "unavailable") {
    return (
      <>
        <p className={`${styles.chip} ${styles.chipUnavailable}`}>Unavailable</p>
        <p className={styles.unavailable}>
          {futures === undefined
            ? "Futures reference is unavailable right now."
            : futuresUnavailableMessage(futures.reason, season)}
        </p>
        <CheckAge check={check} fallbackAt={collectedAt} now={now} />
      </>
    );
  }

  const basisLine =
    futures.basis === "bid-offer-midpoint"
      ? `Midpoint of bid $${futures.bid?.toFixed(2)} and offer $${futures.offer?.toFixed(2)}`
      : futures.basis === "last-trade" && futures.tradedAt !== null
        ? `Last trade on ${nzDate.format(new Date(futures.tradedAt))}`
        : "Prior settlement";
  const size = (value: number | null) =>
    value === null ? "n/a" : nzInt.format(value);
  // The persisted stale flag freezes at collection time; the 72-hour rule is
  // re-evaluated here so retained quotes keep aging.
  const { quoteOld } = freshness(
    futures.quotedAt,
    check?.checkedAt ?? futures.retrievedAt,
    now,
  );

  const warnings = cardWarnings(check, futures.retrievedAt, now);
  if (quoteOld) {
    warnings.push("Quote is more than 72 hours old.");
  }

  return (
    <>
      <div className={styles.priceRow}>
        <p className={styles.price}>
          ${futures.price.toFixed(2)}{" "}
          <span className={styles.unit}>/kgMS</span>
        </p>
        <span className={`${styles.tag} ${styles.tagFutures}`}>
          {BASIS_TAGS[futures.basis]}
        </span>
      </div>
      <p className={styles.meta}>{basisLine}</p>
      <p className={styles.meta}>
        Contract {futures.contractCode} · expires{" "}
        {nzDate.format(new Date(futures.expiry))}
      </p>
      <p className={styles.meta}>
        Bid size {size(futures.bidVolume)} · Offer size {size(futures.offerVolume)} ·
        Traded volume {size(futures.tradedVolume)} · Open interest{" "}
        {size(futures.openInterest)}
      </p>
      <ChipRow warnings={warnings} variant="futures" />
      {futures.quotedAt && (
        <p className={styles.meta}>
          Quoted {nzDateTime.format(new Date(futures.quotedAt))} (NZ time)
        </p>
      )}
      <p className={styles.meta}>
        Checked {nzDate.format(new Date(futures.retrievedAt))}
      </p>
      <a className={styles.sourceLink} href={futures.sourceUrl}>
        View NZX quotes
      </a>
    </>
  );
}

// Provenance wording from the next-release design §6 — no variant claims
// live prices, and legacy data never guesses how it was collected.
function footerNotice(
  provenance: ReadProvenance,
  snapshot: MilkSnapshot | null,
): string {
  if (provenance === "collected" && snapshot !== null) {
    return `Collected from Fonterra and NZX on ${nzDate.format(new Date(snapshot.collectedAt))} — delayed reference data, not live prices.`;
  }
  if (provenance === "fixture") {
    return "Development preview — showing a fixture snapshot, not live prices.";
  }
  return "Reference data collected from official sources; collection date unknown — not live prices.";
}

function futuresUnavailableMessage(reason: FuturesReason, season: string): string {
  switch (reason) {
    case "no-next-data":
    case "no-mkp-curve":
    case "missing-contract":
      return `No matching NZX milk price futures contract for the ${season} season right now.`;
    case "wrong-season":
      return `The listed NZX contract does not settle at the end of the ${season} season.`;
    case "expired":
      return `The ${season} season futures contract has expired.`;
    case "wrong-currency":
      return `The ${season} season futures contract is not priced in NZD.`;
    case "crossed":
      return "The futures market is crossed right now (bid above offer).";
    case "future-quote":
    case "unverifiable":
      return "The futures quote's timestamp could not be verified.";
    case "no-basis":
      return `No usable price is quoted for the ${season} season futures contract.`;
    case "not-collected":
      return "The futures reference was not collected in the last check.";
  }
}

// Next-release design §2: one entry per comparison period, dated and worded;
// suppressed periods explain themselves and never show a delta.
function WhatChanged({
  changes,
  revision,
  snapshot,
  now,
}: {
  changes: ReturnType<typeof futuresChanges>;
  revision: OfficialRevision | null;
  snapshot: MilkSnapshot;
  now: number;
}) {
  if (changes === null && revision === null) return null;
  const entries: { key: string; plain: string; node: ReactNode }[] = [];
  if (changes !== null) {
    entries.push(
      periodEntry("weekly", "Since last week", changes.weekly, snapshot, now),
      periodEntry(
        "announcement",
        "Since Fonterra's announcement",
        changes.sinceAnnouncement,
        snapshot,
        now,
      ),
    );
  }
  if (revision !== null) {
    entries.push({
      key: "revision",
      plain: revisionSentence(revision),
      node: (
        <p className={styles.changeEntry}>{revisionSentence(revision)}</p>
      ),
    });
  }
  // Both periods can suppress with the same sentence (e.g. a basis change);
  // saying it twice would read as a bug, so render each sentence once.
  const seen = new Set<string>();
  const unique = entries.filter((entry) => {
    if (seen.has(entry.plain)) return false;
    seen.add(entry.plain);
    return true;
  });
  return (
    <section
      className={styles.whatChanged}
      aria-labelledby="what-changed-heading"
    >
      <h2 id="what-changed-heading" className={styles.cardTitle}>
        What changed
      </h2>
      {unique.map((entry) => (
        <Fragment key={entry.key}>{entry.node}</Fragment>
      ))}
    </section>
  );
}

function periodEntry(
  period: "weekly" | "announcement",
  title: string,
  outcome: ChangeOutcome,
  snapshot: MilkSnapshot,
  now: number,
): { key: string; plain: string; node: ReactNode } {
  if (outcome.status === "comparable") {
    const { endpoint, baseline, delta } = outcome;
    const endPrice = `$${endpoint.value.toFixed(2)}`;
    const basePrice = `$${baseline.value.toFixed(2)}`;
    const endDate = displayDate(pointDate(endpoint));
    const baseDate = displayDate(pointDate(baseline));
    const words =
      delta > 0
        ? `up $${Math.abs(delta).toFixed(2)}`
        : delta < 0
          ? `down $${Math.abs(delta).toFixed(2)}`
          : "unchanged";
    const plain = `${title} — futures reference ${endPrice} on ${endDate}, ${words} from ${basePrice} on ${baseDate}.`;
    return {
      key: period,
      plain,
      node: (
        <p className={styles.changeEntry}>
          <strong>{title}</strong> — futures reference {endPrice} on {endDate},{" "}
          <span
            className={
              delta > 0
                ? styles.changeDeltaUp
                : delta < 0
                  ? styles.changeDeltaDown
                  : undefined
            }
          >
            {words}
          </span>{" "}
          from {basePrice} on {baseDate}.
        </p>
      ),
    };
  }
  const sentence = suppressionSentence(period, outcome, snapshot, now);
  return {
    key: period,
    plain: sentence,
    node: <p className={styles.changeSuppressed}>{sentence}</p>,
  };
}

function suppressionSentence(
  period: "weekly" | "announcement",
  outcome: Extract<ChangeOutcome, { status: "suppressed" }>,
  snapshot: MilkSnapshot,
  now: number,
): string {
  if (outcome.reason === "endpoint-not-fresh") {
    return `The current reference cannot be treated as fresh (${notFreshCause(snapshot, now)}), so no ${period} comparison is shown.`;
  }
  if (outcome.reason === "basis-changed" && outcome.transition !== null) {
    const { on, from, to } = outcome.transition;
    return `The futures reference changed basis on ${displayDate(on)} (${basisLabel(from)} → ${basisLabel(to)}), so values either side are not directly comparable.`;
  }
  if (outcome.reason === "source-changed" && outcome.transition !== null) {
    const { on } = outcome.transition;
    return `The futures reference changed source on ${displayDate(on)}; earlier values are not directly comparable.`;
  }
  if (
    outcome.observationsBegin === null &&
    nearSeasonStart(snapshot.season, now)
  ) {
    return `A new season began on 1 June — changes compare within the ${snapshot.season} season only.`;
  }
  const withWhom =
    period === "weekly" ? "last week" : "Fonterra's announcement";
  const begin = outcome.observationsBegin;
  return `Not enough collected history yet to compare with ${withWhom}${begin === null ? "" : ` — observations begin ${displayDate(begin)}`}.`;
}

// Mirrors the endpoint freshness gates: which trust problem suppressed the
// summary, in the order the gates apply.
function notFreshCause(snapshot: MilkSnapshot, now: number): string {
  const futures = snapshot.futures;
  const check = snapshot.checks?.futures;
  if (check !== undefined && check.outcome === "retained") {
    return "a retained value";
  }
  if (check !== undefined && check.outcome === "unavailable") {
    return "a failed check";
  }
  const fallbackAt =
    futures !== undefined && futures.status === "ok"
      ? futures.retrievedAt
      : snapshot.collectedAt;
  const { checkStale } = freshness(null, check?.checkedAt ?? fallbackAt, now);
  if (checkStale) return "a stale check";
  return "an old quote";
}

function revisionSentence(revision: OfficialRevision): string {
  return `Fonterra forecast $${revision.current.value.toFixed(2)} on ${displayDate(revision.current.on)}, revised from $${revision.previous.value.toFixed(2)} on ${displayDate(revision.previous.on)}.`;
}

const SEASON_START_WINDOW_MS = 14 * 24 * 3_600_000;

// Presentation heuristic from the design: right after 1 June, "not enough
// history" is expected, not a fault — frame it as the season boundary.
function nearSeasonStart(season: string, now: number): boolean {
  const year = Number(season.slice(0, 4));
  if (!Number.isInteger(year)) return false;
  const start = aucklandDayStartMs(`${year}-06-01`);
  return now >= start && now < start + SEASON_START_WINDOW_MS;
}

function movementOf(label: string, outcome: ChangeOutcome): Movement | null {
  if (outcome.status !== "comparable") return null;
  return {
    label,
    delta: outcome.delta,
    since: displayDate(pointDate(outcome.baseline)),
  };
}

function pointDate(point: ObservationPoint): string {
  return point.effective.kind === "date"
    ? point.effective.on
    : aucklandDateOf(Date.parse(point.effective.at));
}

function displayDate(isoDate: string): string {
  return nzDate.format(new Date(`${isoDate}T00:00:00Z`));
}

function basisLabel(basis: string): string {
  return BASIS_LABELS[basis] ?? basis;
}
