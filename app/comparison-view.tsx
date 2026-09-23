import { freshness } from "../lib/freshness";
import type {
  FuturesBlock,
  FuturesReason,
  MilkSnapshot,
  QuoteBasis,
  SourceCheck,
} from "../lib/snapshot";
import RevenuePanel from "./revenue-panel";
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

export default function ComparisonView({
  snapshot,
  nowMs,
}: {
  snapshot: MilkSnapshot | null;
  nowMs?: number;
}) {
  // Staleness is a display rule evaluated at request time, so retained data
  // keeps aging even while the collector fails.
  // Request-time clock is sound here: force-dynamic server component.
  // eslint-disable-next-line react-hooks/purity
  const now = nowMs ?? Date.now();
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
            <RevenuePanel
              official={snapshot.official}
              futures={snapshot.futures}
              season={snapshot.season}
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
        <p>Development preview — data is a frozen fixture, not live prices.</p>
      </footer>
    </div>
  );
}

function ComparisonCards({ snapshot, now }: { snapshot: MilkSnapshot; now: number }) {
  const { official } = snapshot;
  const hasRange = official.low !== null && official.high !== null;

  return (
    <section className={styles.comparison} aria-label="Price comparison">
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
