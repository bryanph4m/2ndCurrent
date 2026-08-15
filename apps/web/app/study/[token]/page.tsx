import { notFound } from "next/navigation";
import {
  findDraftPassportForItem,
  findMediaForItem,
  findStudyByTokenHash,
  hashStudyToken,
  loadStudyTemplate,
} from "@secondcurrent/db";
import { getObjectStorage } from "@/lib/storage";
import { StudyResponseForm } from "@/components/StudyResponseForm";
import { SiteHeader } from "@/components/SiteChrome";

export const dynamic = "force-dynamic";

// Short-lived: section 16.6 requires signed reads, never a public object URL.
const SIGNED_URL_TTL_SECONDS = 300;

const CONNECTOR_OPTIONS = ["usb_c", "usb_a", "lightning", "barrel", "magsafe"];

type SearchParams = Record<string, string | string[] | undefined>;

function firstString(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function StudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await params;
  const query = await searchParams;

  // Section 16.6: use teracSubmissionId first, then submissionId; refuse a
  // missing or invalid submission ID.
  const submissionId = firstString(query.teracSubmissionId) ?? firstString(query.submissionId);
  const taskId = firstString(query.taskId);
  if (!submissionId || !taskId) {
    notFound();
  }

  const study = await findStudyByTokenHash(hashStudyToken(token));
  if (!study || !study.itemId) {
    notFound();
  }

  const [media, draftPassport] = await Promise.all([
    findMediaForItem(study.itemId),
    findDraftPassportForItem(study.itemId),
  ]);

  const storage = getObjectStorage();
  const photos = await Promise.all(
    media.map(async (asset) => ({
      label: asset.label,
      url: await storage.createSignedReadUrl(asset.objectKey, SIGNED_URL_TTL_SECONDS),
    })),
  );

  const template = loadStudyTemplate();
  const connectorOptions = draftPassport?.connector
    ? [
        draftPassport.connector,
        ...CONNECTOR_OPTIONS.filter((option) => option !== draftPassport.connector),
      ]
    : CONNECTOR_OPTIONS;
  const modelGuess = [draftPassport?.brand, draftPassport?.model].filter(Boolean).join(" ");
  const identityOptions = modelGuess ? [modelGuess] : [];

  return (
    <>
      <SiteHeader compact />
      <main className="study-page page-shell">
        <header className="study-heading">
          <div>
            <p className="eyebrow">Independent evidence review</p>
            <h1>{template.title}</h1>
            <p>{template.description}</p>
          </div>
          <div className="study-time">
            <strong>About 3 minutes</strong>
            <span>Your answers improve the item record.</span>
          </div>
        </header>

        <section className="study-photo-panel" aria-labelledby="evidence-photos-heading">
          <div className="study-section-heading">
            <span>01</span>
            <div>
              <p className="panel-kicker">Review first</p>
              <h2 id="evidence-photos-heading">Evidence photos</h2>
            </div>
          </div>
          <div className="study-photo-grid">
            {photos.map((photo) => (
              <figure key={photo.label}>
                <img src={photo.url} alt={photo.label.replace(/_/g, " ").toLowerCase()} />
                <figcaption>{photo.label.replace(/_/g, " ").toLowerCase()}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="study-form-panel" aria-labelledby="review-questions-heading">
          <div className="study-section-heading">
            <span>02</span>
            <div>
              <p className="panel-kicker">Share your judgment</p>
              <h2 id="review-questions-heading">Review questions</h2>
            </div>
          </div>
          <StudyResponseForm
            token={token}
            taskId={taskId}
            submissionId={submissionId}
            connectorOptions={connectorOptions}
            identityOptions={identityOptions}
          />
        </section>
      </main>
    </>
  );
}
