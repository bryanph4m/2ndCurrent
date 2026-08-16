import { notFound } from "next/navigation";
import { findActiveListingByItemSlug, findPublishedPassportBySlug } from "@secondcurrent/db";
import { BuyButton } from "@/components/BuyButton";
import { ProductGlyph } from "@/components/ProductGlyph";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export const dynamic = "force-dynamic";

// Section 25.1's route labels.
const ROUTE_LABELS: Record<string, string> = {
  RESELL: "Resell",
  DONATE: "Donate",
  REPAIR: "Repair",
  RECYCLE: "Recycle",
  NEEDS_MORE_EVIDENCE: "Get more evidence",
  DO_NOT_LIST: "Do not list",
};

const SAFETY_COPY: Record<string, string> = {
  CLEAR: "No safety issues found in the photos.",
  NEEDS_REVIEW: "This item needs a closer look before it can be listed.",
  DO_NOT_LIST: "This item should not be listed from the current evidence.",
};

// Section 25.2: labels only, never the raw score, on a public page.
function confidenceLabel(score: number): "High" | "Medium" | "Low" {
  if (score >= 0.88) return "High";
  if (score >= 0.7) return "Medium";
  return "Low";
}

type EvidenceSummaryEntry = { label: string; capturedAt: string; reviewedByPeople: boolean };

export default async function PassportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const passport = await findPublishedPassportBySlug(slug);
  if (!passport) {
    notFound();
  }
  const listing = await findActiveListingByItemSlug(slug);

  const knownFacts = passport.knownFacts as string[];
  const unknownFacts = passport.unknownFacts as string[];
  const evidence = passport.evidenceSummary as EvidenceSummaryEntry[];

  return (
    <>
      <SiteHeader compact />
      <main className="passport-page page-shell">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <a href="/">Home</a>
          <span aria-hidden="true">/</span>
          <span>Item passport</span>
        </nav>

        <section className="passport-hero">
          <div className="passport-media">
            <span className="passport-media-label">Evidence-backed item record</span>
            <ProductGlyph kind="device" />
            <div className="passport-media-proof">
              <span className="status-dot" />
              Published passport
            </div>
          </div>

          <div className="passport-summary">
            <p className="eyebrow">SecondCurrent verified record</p>
            <h1>{passport.title}</h1>
            <div className="summary-pills">
              <span className="confidence-pill">
                {confidenceLabel(passport.identityConfidence)} identity confidence
              </span>
              <span>Condition {passport.conditionGrade}</span>
            </div>
            <div className="recommendation-box">
              <span>Recommended next step</span>
              <strong>
                {ROUTE_LABELS[passport.recommendedRoute] ?? passport.recommendedRoute}
              </strong>
              {passport.suggestedPriceCents != null && (
                <div className="suggested-price">
                  <small>Suggested price</small>
                  <b>${(passport.suggestedPriceCents / 100).toFixed(2)}</b>
                </div>
              )}
            </div>
            <p className="summary-note">
              This page separates confirmed evidence from open questions so the next person can make
              a safer decision.
            </p>
            {listing && (
              <div className="suggested-price" style={{ position: "static", marginTop: 20 }}>
                <small>Listed price</small>
                <b>${(listing.priceCents / 100).toFixed(2)}</b>
                {listing.purchasable ? (
                  <div style={{ marginTop: 14 }}>
                    <BuyButton slug={slug} className="button button-primary button-large" />
                  </div>
                ) : (
                  <p className="empty-state" style={{ marginTop: 10, marginBottom: 0 }}>
                    Not yet available to buy.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="passport-content-grid">
          <div className="passport-main-column">
            <article className="passport-panel">
              <div className="panel-heading">
                <span className="panel-icon panel-icon-confirmed" aria-hidden="true">
                  ✓
                </span>
                <div>
                  <p className="panel-kicker">Supported by the evidence</p>
                  <h2>What we could confirm</h2>
                </div>
              </div>
              {knownFacts.length > 0 ? (
                <ul className="fact-list confirmed-list">
                  {knownFacts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">Nothing confirmed yet.</p>
              )}
            </article>

            <article className="passport-panel">
              <div className="panel-heading">
                <span className="panel-icon panel-icon-unknown" aria-hidden="true">
                  ?
                </span>
                <div>
                  <p className="panel-kicker">Not visible or not conclusive</p>
                  <h2>What is still unknown</h2>
                </div>
              </div>
              {unknownFacts.length > 0 ? (
                <ul className="fact-list unknown-list">
                  {unknownFacts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No unresolved facts were recorded.</p>
              )}
            </article>

            <article className="passport-panel evidence-panel">
              <div className="panel-heading">
                <span className="panel-icon" aria-hidden="true">
                  ⌕
                </span>
                <div>
                  <p className="panel-kicker">Traceable inputs</p>
                  <h2>Evidence reviewed</h2>
                </div>
              </div>
              <ul className="evidence-list">
                {evidence.map((entry) => (
                  <li key={`${entry.label}-${entry.capturedAt}`}>
                    <span className="evidence-type">
                      {entry.label.replace(/_/g, " ").toLowerCase()}
                    </span>
                    <span>{new Date(entry.capturedAt).toLocaleDateString()}</span>
                    <span>{entry.reviewedByPeople ? "Human reviewed" : "System reviewed"}</span>
                  </li>
                ))}
              </ul>
              <p className="review-count">
                Reviewed by {passport.humanReviewCount}{" "}
                {passport.humanReviewCount === 1 ? "person" : "people"}.
              </p>
            </article>
          </div>

          <aside className="passport-side-column">
            <article className="passport-panel compact-panel">
              <p className="panel-kicker">Condition</p>
              <div className="condition-grade">
                <strong>{passport.conditionGrade}</strong>
                <span>Recorded grade</span>
              </div>
            </article>

            <article className="passport-panel compact-panel">
              <p className="panel-kicker">Safety and data</p>
              <h2>Before the handoff</h2>
              <p>{SAFETY_COPY[passport.safetyStatus] ?? SAFETY_COPY.NEEDS_REVIEW}</p>
              {passport.dataRisk === "BLOCKED" ? (
                <div className="warning-note">This item may still hold personal data.</div>
              ) : (
                <div className="clear-note">No blocking data risk was recorded.</div>
              )}
            </article>

            <article className="passport-panel compact-panel limits-panel">
              <p className="panel-kicker">Important limits</p>
              <p>{passport.disclaimer}</p>
            </article>
          </aside>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
