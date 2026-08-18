import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1>Tracer</h1>
          <p>AI-powered production debugging, from incident to verified fix.</p>
        </div>
      </main>
    </div>
  );
}
