import { createItemSaleCheckout } from "@secondcurrent/db";
import { ItemSaleCheckoutRequestSchema } from "@secondcurrent/domain";
import { getIntakeCrypto } from "@/lib/crypto";
import { getAppBaseUrl, getPaymentProvider } from "@/lib/payment";
import {
  enforcePublicRateLimit,
  readLimitedText,
  requestTooLargeResponse,
} from "@/lib/requestSafety";

// Resolves the real item id and the seller's Stripe account id entirely
// server-side (packages/db/src/repositories/listingRepository.ts's
// findSaleTargetBySlug) - the slug in the URL is the only identifier the
// browser ever supplies, matching section 16.8's exclusion rules.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const limited = enforcePublicRateLimit(request, "buy-checkout", {
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { slug } = await params;
  let rawBody: string;
  try {
    rawBody = await readLimitedText(request, 4_000);
  } catch {
    return requestTooLargeResponse();
  }

  const parsed = ItemSaleCheckoutRequestSchema.safeParse(
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

  const crypto = getIntakeCrypto();
  const result = await createItemSaleCheckout(
    {
      slug,
      buyerPhone: parsed.data.phone,
      hashPhone: crypto.hashPhone,
      encryptPhone: crypto.encryptPhone,
      appBaseUrl: getAppBaseUrl(),
    },
    (input) => getPaymentProvider().createConnectCheckout(input),
  );

  if (!result) {
    return Response.json({ error: "item is not available to buy" }, { status: 404 });
  }

  return Response.json({ checkoutUrl: result.checkoutUrl });
}
