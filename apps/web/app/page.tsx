export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <h1 style={{ fontSize: "2.5rem" }}>Find a better next use for old electronics.</h1>
      <p style={{ fontSize: "1.25rem", color: "var(--color-muted)" }}>
        Send a few photos. Get a clear item record and a safe next step.
      </p>

      <div style={{ display: "flex", gap: "1rem", margin: "2rem 0" }}>
        <a className="button button-primary" href="sms:">
          Start by text
        </a>
        <a className="button button-secondary" href="/admin">
          See verified items
        </a>
      </div>

      <section>
        <h2>How it works</h2>
        <div style={{ display: "grid", gap: "1rem" }}>
          <div className="card">
            <h3>1. Send photos</h3>
            <p>Show the full item, connector, and label.</p>
          </div>
          <div className="card">
            <h3>2. We check the evidence</h3>
            <p>We identify what we can and ask when something is missing.</p>
          </div>
          <div className="card">
            <h3>3. Get a next step</h3>
            <p>Resell, donate, repair, recycle, or gather more evidence.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
