import { notFound } from "next/navigation";
import { findPublishedPassportBySlug } from "@secondcurrent/db";

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

  const knownFacts = passport.knownFacts as string[];
  const unknownFacts = passport.unknownFacts as string[];
  const evidence = passport.evidenceSummary as EvidenceSummaryEntry[];

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <section>
        <h1>{passport.title}</h1>
        <p>Confidence: {confidenceLabel(passport.identityConfidence)}</p>
      </section>

      <section>
        <h2>What we could confirm</h2>
        {knownFacts.length > 0 ? (
          <ul>
            {knownFacts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        ) : (
          <p>Nothing confirmed yet.</p>
        )}
      </section>

      <section>
        <h2>What is still unknown</h2>
        {unknownFacts.length > 0 ? (
          <ul>
            {unknownFacts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        ) : (
          <p>Nothing is unknown.</p>
        )}
      </section>

      <section>
        <h2>Condition</h2>
        <p>Grade {passport.conditionGrade}</p>
      </section>

      <section>
        <h2>Safety notes</h2>
        <p>{SAFETY_COPY[passport.safetyStatus] ?? SAFETY_COPY.NEEDS_REVIEW}</p>
        {passport.dataRisk === "BLOCKED" && <p>This item may still hold personal data.</p>}
      </section>

      <section>
        <h2>Suggested next step</h2>
        <p>{ROUTE_LABELS[passport.recommendedRoute] ?? passport.recommendedRoute}</p>
        {passport.suggestedPriceCents != null && (
          <p>Suggested price: ${(passport.suggestedPriceCents / 100).toFixed(2)}</p>
        )}
      </section>

      <section>
        <h2>Evidence</h2>
        <ul>
          {evidence.map((entry) => (
            <li key={`${entry.label}-${entry.capturedAt}`}>
              {entry.label.replace(/_/g, " ").toLowerCase()} -{" "}
              {new Date(entry.capturedAt).toLocaleDateString()}
              {entry.reviewedByPeople ? " (reviewed by people)" : ""}
            </li>
          ))}
        </ul>
        <p>
          Reviewed by {passport.humanReviewCount}{" "}
          {passport.humanReviewCount === 1 ? "person" : "people"}.
        </p>
      </section>

      <section>
        <h2>Important limits</h2>
        <p>{passport.disclaimer}</p>
      </section>
    </main>
  );
}
