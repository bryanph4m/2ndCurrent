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
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <h1>{template.title}</h1>
      <p>{template.description}</p>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.75rem",
          margin: "1.5rem 0",
        }}
      >
        {photos.map((photo) => (
          <img
            key={photo.label}
            src={photo.url}
            alt={photo.label.replace(/_/g, " ").toLowerCase()}
            style={{ width: "100%", borderRadius: 4 }}
          />
        ))}
      </section>

      <StudyResponseForm
        token={token}
        taskId={taskId}
        submissionId={submissionId}
        connectorOptions={connectorOptions}
        identityOptions={identityOptions}
      />
    </main>
  );
}
