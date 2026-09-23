import { freshness } from "../lib/freshness";
import type {
  FuturesBlock,
  FuturesReason,
  MilkSnapshot,
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
    <div className={styles.shell}>
      <header className={styles.banner}>
        <p className={styles.brand}>MilkCompass</p>
        {snapshot && <p className={styles.season}>{snapshot.season} season</p>}
      </header>
      <main className={styles.main}>
        <h1>What does the milk price mean for your farm?</h1>
        <p className={styles.lede}>
          Compare today&apos;s reference prices and explore your revenue.
        </p>
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
        <p className={styles.price}>
          ${official.midpoint.toFixed(2)}{" "}
          <span className={styles.unit}>/kgMS</span>
        </p>
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
        <CheckNotices
          check={snapshot.checks?.official}
          retrievedAt={official.retrievedAt}
          now={now}
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
          now={now}
        />
      </article>
    </section>
  );
}

// Failed checks are exposed beside the retained value; the 36-hour rule keeps
// a stalled collector from looking current.
function CheckNotices({
  check,
  retrievedAt,
  now,
}: {
  check?: SourceCheck;
  retrievedAt: string;
  now: number;
}) {
  const { checkStale } = freshness(
    null,
    check?.checkedAt ?? retrievedAt,
    now,
  );
  return (
    <>
      {check && check.outcome !== "ok" && (
        <p className={styles.warning}>
          The latest collection on {nzDate.format(new Date(check.checkedAt))}{" "}
          failed — showing the previous value.
        </p>
      )}
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
  now,
}: {
  futures: FuturesBlock | undefined;
  check?: SourceCheck;
  season: string;
  now: number;
}) {
  if (futures === undefined) {
    return (
      <p className={styles.unavailable}>
        Futures reference is unavailable right now.
      </p>
    );
  }
  if (futures.status === "unavailable") {
    return (
      <p className={styles.unavailable}>
        {futuresUnavailableMessage(futures.reason, season)}
      </p>
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

  return (
    <>
      <p className={styles.price}>
        ${futures.price.toFixed(2)} <span className={styles.unit}>/kgMS</span>
      </p>
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
      {quoteOld && (
        <p className={styles.warning}>Quote is more than 72 hours old.</p>
      )}
      {futures.quotedAt && (
        <p className={styles.meta}>
          Quoted {nzDateTime.format(new Date(futures.quotedAt))} (NZ time)
        </p>
      )}
      <CheckNotices
        check={check}
        retrievedAt={futures.retrievedAt}
        now={now}
      />
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
