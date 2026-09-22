import styles from "./page.module.css";

export default function Page() {
  return (
    <div className={styles.shell}>
      <header className={styles.banner}>
        <p className={styles.brand}>MilkCompass</p>
      </header>
      <main className={styles.main}>
        <h1>What does the milk price mean for your farm?</h1>
        <p>Compare today&apos;s reference prices and explore your revenue.</p>
      </main>
      <footer className={styles.footer}>
        <p>Comparison data arrives in a later release.</p>
      </footer>
    </div>
  );
}
