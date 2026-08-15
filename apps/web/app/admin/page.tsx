import { getJudgingDashboard, listItems, listOrders } from "@secondcurrent/db";

export const dynamic = "force-dynamic";

const tableStyle = { width: "100%", borderCollapse: "collapse" } as const;
const headingStyle = { textAlign: "left", padding: "0.5rem" } as const;
const cellStyle = { padding: "0.5rem", borderTop: "1px solid #dddddd" } as const;

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function AdminPage() {
  const [items, orders, dashboard] = await Promise.all([
    listItems(),
    listOrders(),
    getJudgingDashboard(),
  ]);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <h1>SecondCurrent admin</h1>
      <nav aria-label="Admin sections" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <a href="#orders">Orders</a>
        <a href="#items">Items</a>
        <a href="#studies">Studies</a>
        <a href="#messages">Messages</a>
        <a href="#attention">Needs attention</a>
        <a href="#revenue">Revenue</a>
        <a href="#impact">Impact</a>
        <a href="#settings">Settings</a>
      </nav>

      <section id="revenue">
        <h2>Revenue and cost</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "1rem",
          }}
        >
          <article className="card">
            <strong>Service revenue</strong>
            <div>{money(dashboard.business.serviceRevenueCents)}</div>
          </article>
          <article className="card">
            <strong>Market cost</strong>
            <div>{money(dashboard.business.marketCostCents)}</div>
          </article>
          <article className="card">
            <strong>Sponsored credit</strong>
            <div>{money(dashboard.business.sponsoredCreditCents)}</div>
          </article>
          <article className="card">
            <strong>Gross margin</strong>
            <div>{money(dashboard.business.grossMarginCents)}</div>
          </article>
        </div>
        <p>Sponsored credit is shown separately and does not reduce the market cost.</p>
      </section>

      <section id="attention">
        <h2>Needs attention</h2>
        {dashboard.needsAttention.length === 0 ? (
          <p>No terminal provider or workflow failures.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={headingStyle}>Type</th>
                <th style={headingStyle}>ID</th>
                <th style={headingStyle}>Attempts</th>
                <th style={headingStyle}>Reason</th>
                <th style={headingStyle}>Time</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.needsAttention.map((entry) => (
                <tr key={`${entry.kind}:${entry.id}`}>
                  <td style={cellStyle}>{entry.kind}</td>
                  <td style={cellStyle}>{entry.id}</td>
                  <td style={cellStyle}>{entry.attemptCount}</td>
                  <td style={cellStyle}>{entry.reason}</td>
                  <td style={cellStyle}>{entry.occurredAt.toISOString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section id="studies">
        <h2>Studies</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
          }}
        >
          <article className="card">
            <strong>Human cost per corrected item</strong>
            <div>
              {dashboard.reviewEfficiency.humanCostPerCorrectedItemCents === null
                ? "Not available"
                : money(dashboard.reviewEfficiency.humanCostPerCorrectedItemCents)}
            </div>
            <small>{dashboard.reviewEfficiency.correctedItems} corrected items</small>
          </article>
          <article className="card">
            <strong>Responses per resolved ambiguity</strong>
            <div>
              {dashboard.reviewEfficiency.responsesPerResolvedAmbiguity === null
                ? "Not available"
                : dashboard.reviewEfficiency.responsesPerResolvedAmbiguity.toFixed(1)}
            </div>
            <small>{dashboard.reviewEfficiency.resolvedAmbiguities} resolved ambiguities</small>
          </article>
        </div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={headingStyle}>Type</th>
              <th style={headingStyle}>Status</th>
              <th style={headingStyle}>Raw responses</th>
              <th style={headingStyle}>Target</th>
              <th style={headingStyle}>Actual cost</th>
              <th style={headingStyle}>Cost per response</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.studies.map((study) => (
              <tr key={study.id}>
                <td style={cellStyle}>{study.type}</td>
                <td style={cellStyle}>{study.status}</td>
                <td style={cellStyle}>{study.approvedResponses}</td>
                <td style={cellStyle}>{study.targetParticipants}</td>
                <td style={cellStyle}>
                  {study.actualCostCents === null ? "Not recorded" : money(study.actualCostCents)}
                </td>
                <td style={cellStyle}>
                  {study.costPerApprovedResponseCents === null
                    ? "Not available"
                    : money(study.costPerApprovedResponseCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Before and after metrics</h3>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={headingStyle}>Study</th>
              <th style={headingStyle}>Version</th>
              <th style={headingStyle}>Raw sample size</th>
              <th style={headingStyle}>Stored metrics</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.metrics.map((snapshot) => (
              <tr key={`${snapshot.studyId}:${snapshot.variant}`}>
                <td style={cellStyle}>{snapshot.studyId}</td>
                <td style={cellStyle}>{snapshot.variant}</td>
                <td style={cellStyle}>{snapshot.sampleSize}</td>
                <td style={cellStyle}>
                  <code>{JSON.stringify(snapshot.metrics)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Product changes</h2>
        {dashboard.productChanges.length === 0 ? (
          <p>No product changes recorded.</p>
        ) : (
          <ul>
            {dashboard.productChanges.map((change) => (
              <li key={change.id}>
                <strong>{change.code}</strong>: {change.finding} ({change.occurrenceCount} finding
                {change.occurrenceCount === 1 ? "" : "s"})
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="impact">
        <h2>Impact</h2>
        <p>Completed local handoffs: {dashboard.impact.localHandoffs}</p>
        <p>Recorded item weight: {dashboard.impact.recordedWeightGrams} grams</p>
      </section>

      <section id="items">
        <h2>Items</h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={headingStyle}>ID</th>
              <th style={headingStyle}>Status</th>
              <th style={headingStyle}>Category</th>
              <th style={headingStyle}>Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={cellStyle}>{item.id}</td>
                <td style={cellStyle}>{item.status}</td>
                <td style={cellStyle}>{item.category ?? "Unknown"}</td>
                <td style={cellStyle}>{item.createdAt.toISOString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section id="orders">
        <h2>Orders</h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={headingStyle}>ID</th>
              <th style={headingStyle}>Status</th>
              <th style={headingStyle}>Amount</th>
              <th style={headingStyle}>Created</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td style={cellStyle}>{order.id}</td>
                <td style={cellStyle}>{order.status}</td>
                <td style={cellStyle}>
                  {(order.amountCents / 100).toFixed(2)} {order.currency}
                </td>
                <td style={cellStyle}>{order.createdAt.toISOString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section id="messages">
        <h2>Messages</h2>
        <p>Message delivery details are stored in the message and outbox records.</p>
      </section>

      <section id="settings">
        <h2>Settings</h2>
        <p>Provider and policy settings are managed through server configuration.</p>
      </section>
    </main>
  );
}
