import { createRecoveryCheckOrder, db } from "@secondcurrent/db";
import { verifyConversationToken } from "@secondcurrent/domain";
import { getConversationTokenSecret } from "@/lib/crypto";
import { recoveryCheckoutRequestSchema } from "@/lib/checkoutSchema";
import { getAppBaseUrl, getPaymentProvider } from "@/lib/payment";
import {
  enforcePublicRateLimit,
  readLimitedText,
  requestTooLargeResponse,
} from "@/lib/requestSafety";

const REQUIRED_PHOTO_COUNT = 3;

export async function POST(request: Request): Promise<Response> {
  const limited = enforcePublicRateLimit(request, "recovery-checkout", {
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;
  let rawBody: string;
  try {
    rawBody = await readLimitedText(request, 16_000);
  } catch {
    return requestTooLargeResponse();
  }
  const parsed = recoveryCheckoutRequestSchema.safeParse(
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

  let itemId: string;
  let contactId: string;
  try {
    ({ itemId, contactId } = verifyConversationToken(
      getConversationTokenSecret(),
      parsed.data.token,
    ));
  } catch {
    return Response.json({ error: "invalid or expired token" }, { status: 401 });
  }

  const item = await db.item.findUnique({ where: { id: itemId } });
  if (!item || item.ownerContactId !== contactId) {
    return Response.json({ error: "item not found" }, { status: 404 });
  }

  const photoCount = await db.mediaAsset.count({ where: { itemId } });
  if (photoCount < REQUIRED_PHOTO_COUNT) {
    return Response.json({ error: "required photos are missing" }, { status: 409 });
  }

  const result = await createRecoveryCheckOrder(
    {
      contactId,
      itemId,
      appBaseUrl: getAppBaseUrl(),
    },
    (input) => getPaymentProvider().createCheckout(input),
  );

  return Response.json({ orderId: result.orderId, checkoutUrl: result.checkoutUrl });
}
