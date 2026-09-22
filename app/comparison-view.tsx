import type { MilkSnapshot } from "../lib/snapshot";
import styles from "./page.module.css";

const announcementDate = new Intl.DateTimeFormat("en-NZ", {
  timeZone: "Pacific/Auckland",
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default function ComparisonView({
  snapshot,
}: {
  snapshot: MilkSnapshot | null;
}) {
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
          <ComparisonCards snapshot={snapshot} />
        ) : (
          <p className={styles.unavailable}>
            Reference prices are unavailable right now.
          </p>
        )}
      </main>
      <footer className={styles.footer}>
        <p>Development preview — figures are sample data, not live prices.</p>
      </footer>
    </div>
  );
}

function ComparisonCards({ snapshot }: { snapshot: MilkSnapshot }) {
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
          Announced {announcementDate.format(new Date(official.announcedAt))}
        </p>
        <a className={styles.sourceLink} href={official.sourceUrl}>
          View official source
        </a>
      </article>
      <article className={styles.card} aria-labelledby="futures-heading">
        <h2 id="futures-heading" className={styles.cardTitle}>
          Futures reference
        </h2>
        <p className={styles.meta}>Futures reference arrives in a later release.</p>
      </article>
    </section>
  );
}
