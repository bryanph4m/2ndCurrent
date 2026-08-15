import { findStudyByTokenHash, hashStudyToken, insertReviewResponse } from "@secondcurrent/db";
import { StudyResponseRequestSchema } from "@secondcurrent/domain";
import {
  enforcePublicRateLimit,
  readLimitedText,
  requestTooLargeResponse,
} from "@/lib/requestSafety";

// Section 16.7: insert the response once, then hand back the URL the
// browser redirects to. Section 22.3's exact callback shape.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const limited = enforcePublicRateLimit(request, "study-response", {
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const { token } = await params;
  let rawBody: string;
  try {
    rawBody = await readLimitedText(request, 64_000);
  } catch {
    return requestTooLargeResponse();
  }
  const parsed = StudyResponseRequestSchema.safeParse(
    (() => {
      try {
        return JSON.parse(rawBody);
      } catch {
        return null;
      }
    })(),
  );
  if (!parsed.success) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  const study = await findStudyByTokenHash(hashStudyToken(token));
  if (!study) {
    return Response.json({ error: "study not found" }, { status: 404 });
  }

  const submissionId = parsed.data.teracSubmissionId ?? parsed.data.submissionId;
  if (!submissionId) {
    return Response.json({ error: "missing submission id" }, { status: 400 });
  }

  await insertReviewResponse({
    studyId: study.id,
    externalSubmissionId: submissionId,
    externalTaskId: parsed.data.taskId,
    answers: parsed.data.answers,
  });

  const redirectUrl = `https://terac.com/api/external/callback?teracSubmissionId=${encodeURIComponent(submissionId)}&result=completed`;
  return Response.json({ redirectUrl });
}
