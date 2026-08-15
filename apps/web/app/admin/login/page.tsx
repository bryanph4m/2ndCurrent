export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="shell">
      <section className="hero" style={{ maxWidth: 560, margin: "10vh auto" }}>
        <p className="eyebrow">SecondCurrent operations</p>
        <h1>Admin sign in</h1>
        <p className="lede">Use the deployment password to open the private judging dashboard.</p>
        <form action="/api/admin/login" method="post" style={{ display: "grid", gap: 12 }}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
          {error ? <p role="alert">That password was not accepted.</p> : null}
          <button type="submit">Sign in</button>
        </form>
      </section>
    </main>
  );
}
