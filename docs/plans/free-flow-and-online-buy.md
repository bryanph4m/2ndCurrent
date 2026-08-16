# Free evidence check + real online buy flow

## Context

Today, after a seller texts 3 photos to Linq, the app sends "We received your photos. Pay for the item check here: `<stripe payment link>`" and only runs the vision analysis after that $50 Recovery Check is paid. The user wants this free: photos in, evidence check runs immediately at no charge. Separately, they want a real "Buy" flow so other users can purchase an item directly through the app, with the seller actually receiving the money and SecondCurrent taking a commission on the sale (confirmed: free to list, commission only on sale, flat percentage of price).

This is a deliberate departure from two things `docs/architecture.md` currently calls out: section 2.3 lists "a general electronics marketplace" as a non-goal, and section 2.2 defers "physical item payments" to after the required flow works. The user is choosing to build both now; `docs/architecture.md` should get a follow-up doc update after this ships, but that's not blocking.

**Good news discovered during investigation:** free listing creation is *already fully built*. Once an item finalizes with route `RESELL` (safety/data-risk clear, price known), `packages/db/src/finalizeItemFlow.ts`'s `writeFinalizedPassport` (line 166) already calls `offerListingForPublishedItem` (`packages/db/src/marketplaceFlow.ts:151-193`), which creates a `DRAFT` `Listing` and texts the seller `LISTING_APPROVAL_TEXT` ("Reply APPROVE to list it..."). The seller's `APPROVE` reply already flips it to `ACTIVE` via `approveSellerListing` (`marketplaceFlow.ts:278-334`). So most of "create a store post" needs zero new code — it just needs to actually be reached, which today only happens after payment.

The only genuinely new territory is the **buyer side**: no buyer web UI, no Stripe Connect, no online payment collection exists anywhere in this repo today.

## Phase A — Remove the paid gate

**Change** `packages/domain/src/services/linqIntake.ts:241-256`, the `totalCount >= REQUIRED_PHOTO_COUNT` branch:

- Replace `ports.transitionConversation({ ..., to: "WAITING_FOR_PAYMENT" })` with `to: "ANALYZING"`.
- Replace `ports.createRecoveryCheckOrder(...)` + the `CHECKOUT_LINK_PREFIX` text with a new port `ports.enqueueItemAnalysis({ itemId })`, and send the existing-but-currently-unused `ANALYSIS_STARTED_TEXT` (`packages/domain/src/messaging/templates.ts:47`, "We are checking the item photos now.") instead.
- Fix the last line of `CONSENT_AND_PHOTO_INSTRUCTIONS_TEXT` (`templates.ts:18`, currently "After we get all three, we will text a link to pay for the check.") since it will now be false.

**State machine edits** (both are one-line additions, not restructures):
- `packages/domain/src/states/conversation.ts:35` — add `"ANALYZING"` to `WAITING_FOR_PHOTOS`'s allowed targets (`ORDER_PAID` becomes unreachable and gets deleted, see below).
- `packages/domain/src/states/item.ts:21` — add `"QUEUED"` to `INTAKE`'s allowed targets.

**New DB function**, e.g. `packages/db/src/analyzeItemFlow.ts` (or a new small file): `queueItemForAnalysis(itemId)` — one transaction doing `transitionWithAudit` `INTAKE -> QUEUED` (action `"item.queued"`, same audit action string `markOrderPaidAndQueueAnalysis` already uses, for continuity), no `ServiceOrder`/`LedgerEntry` touched. Then have the port call `startTaskOnce({ taskName: "analyze-item", input: { itemId }, idempotencyKey: \`analyze:${itemId}:1\` }, ...)`, exactly the pattern `apps/web/app/api/webhooks/stripe/route.ts:107-116` already uses.

**Wire the new port** in `IntakePorts` (`linqIntake.ts`) and both its implementations:
- `packages/db/src/linqPorts.ts` (`createLinqIntakePorts`) — add an injected `startAnalysisTask` dependency.
- Caller 1: `apps/web/app/api/webhooks/linq/route.ts`'s `ensureTaskRegistered` — implement using `getTaskRunner()` from `apps/web/lib/tasks.ts` (mirrors the existing stripe webhook's dispatch).
- Caller 2: `apps/workflows/src/tasks/process-webhook.ts` (`processStoredWebhook`) — this runs inside a Render task already; add a small equivalent task-start helper in `apps/workflows/src/runtime/` (construct `RenderTaskRunner`/`InlineTaskRunner` from the same env vars `providers.ts` already reads) and call `startTaskOnce` the same way.

**Delete, don't leave dormant** (matches this session's established "delete unused code" precedent, and there's no reason to keep a payment path for a product the user just said should never charge on intake):
- `createRecoveryCheckOrder` and `RECOVERY_CHECK_PRODUCT_CODE`/`RECOVERY_CHECK_PRICE_CENTS` from `packages/db/src/paymentFlow.ts`.
- `markOrderPaidAndQueueAnalysis` from the same file — once recovery-check is gone, nothing calls it (Phase D needs its own function for sale completion, see below; its business logic differs: a sale doesn't transition Item to `QUEUED`).
- `apps/web/app/api/checkout/recovery-check/route.ts` entirely.
- `createRecoveryCheckOrder` from the `IntakePorts` interface and `linqPorts.ts`.
- `CHECKOUT_LINK_PREFIX` and `PAYMENT_RECEIVED_TEXT` from `templates.ts` (both become dead).
- `"WAITING_FOR_PAYMENT"` / `"ORDER_PAID"` from `ConversationState` (both the Prisma enum and the domain union type). Also remove `ItemStatus.WAITING_FOR_PAYMENT` — it becomes unreachable too once `INTAKE -> QUEUED` is added directly.
- The Stripe webhook route's handling stays generic (it already branches on `order.productCode`) — Phase D adds the new `ITEM_SALE` branch alongside, not instead.

## Phase B — Seller payouts (Stripe Connect)

**Trigger point:** inside `approveSellerListing` (`marketplaceFlow.ts:278-334`), right after the listing flips to `ACTIVE` (after line 331). This is the first moment a seller has committed to a public, sellable listing — earlier (e.g. at photo intake) would ask everyone to onboard for payouts even if their item ends up donated/recycled/repaired.

Add: if the seller's `Contact` has no `stripeConnectAccountId`, create a Stripe Express connected account server-side and generate an Account Link (Stripe's own hosted onboarding flow — no custom token/session system needed, Stripe's links are already secure and single-purpose). Text the seller that link. **Express, not Standard** — Express is built for platform-managed marketplaces where the platform controls the buyer experience and Stripe handles onboarding UI and payouts; Standard assumes the connected account operates semi-independently, which doesn't fit sellers who never see a dashboard.

**Schema:** add to `Contact` (`prisma/schema.prisma:177-194`): `stripeConnectAccountId String? @unique`, `stripeConnectOnboardedAt DateTime?`. A new model isn't warranted — it's a 1:1 relationship on an existing entity with no independent state machine or lifecycle of its own.

**If a buyer tries to buy before onboarding finishes:** the public item page must not show a working Buy button at all in that case (not "show button, fail on click"). The listing query needs a server-computed `purchasable` boolean (seller onboarded AND listing ACTIVE), never the seller's identity — this keeps the section 16.8 no-seller-identity-on-public-pages rule intact.

## Phase C — Buyer checkout

**New routes:**
- `apps/web/app/browse/page.tsx` — public listings page. Query `Listing` where `status = "ACTIVE"` joined to the item's published `RecoveryPassport`, through a new `packages/db/src/repositories/listingRepository.ts` (doesn't exist yet; today `Listing` access is inline in `marketplaceFlow.ts` for the unrelated SMS peer-match flow). Apply the same exclusion discipline as `PUBLIC_PASSPORT_SELECT` (`passportRepository.ts:8-28`): never select `Item.id`.
- `apps/web/app/item/[slug]/page.tsx` — add a Buy CTA when a `Listing` exists, is `ACTIVE`, and `purchasable` is true.
- `apps/web/app/api/checkout/buy/[slug]/route.ts` — new. Resolves `itemId`/seller server-side via a fresh non-public query (slug in the URL, never itemId), creates the Stripe Connect Checkout Session.
- `apps/web/app/checkout/buy-return/page.tsx` — buyer-facing post-purchase page, same shape as the existing `apps/web/app/checkout/return/page.tsx` template. Display-only; never marks anything paid from the return URL (matches the project's explicit rule and the existing recovery-check flow's own discipline).

**Buyer identity: phone, reusing `Contact`/`findOrCreateContact` unchanged.** `Contact` is phone-keyed end to end and all outbound notification in this app is SMS via Linq — there's no email-sending integration anywhere. Stripe Checkout collects phone + email natively (`phone_number_collection`, `customer_email`) without a custom form; email backs the Stripe receipt only, phone backs the `Contact` row so the buyer gets the same SMS notification treatment sellers already get. This keeps exactly one identity model in the system.

**Stripe Connect Checkout Session** — new method on `packages/integrations/src/stripe/live.ts`'s `StripePaymentProvider` (today's `createCheckout` is a static Dashboard Payment Link, unusable for a variable price + per-seller destination). Stays behind the adapter per this repo's "provider SDK types stay in adapter packages" rule — this is an extension of the Stripe integration already in use, not a new provider. Calls `stripe.checkout.sessions.create` with:
- `line_items`: the listing's `priceCents`.
- `payment_intent_data.application_fee_amount`: commission, computed server-side from a hardcoded constant (see below) — never client-supplied, matching how `RECOVERY_CHECK_PRICE_CENTS` is guarded today.
- `payment_intent_data.transfer_data.destination`: seller's `stripeConnectAccountId`.
- `client_reference_id`: the new sale `ServiceOrder.id`.
- `success_url` / `cancel_url`: the buy-return page / the item page.
- `customer_email`, `phone_number_collection`.

**Sale order: reuse `ServiceOrder` with a new `productCode = "ITEM_SALE"`**, not a new model. `Item.orders ServiceOrder[]` is already one-to-many, so a second order per item needs no relational change, and `ServiceOrder`'s existing state machine (`DRAFT -> CHECKOUT_CREATED -> PAID -> ...`), unique `checkoutSessionId`/`paymentId`, and `LedgerEntry[]` all map directly onto "a sale, paid once, needs a ledger row." Building a parallel model would duplicate all of that. One semantic shift worth noting: `ServiceOrder.contactId` today always means "the item's owner" (the recovery-check payer); for a sale order it means the **buyer**. The seller stays reachable via `Item.owner`.

**Commission:** flat percentage of sale price, as a hardcoded server-side constant next to where `RECOVERY_CHECK_PRICE_CENTS` used to live (e.g. `packages/db/src/marketplaceFlow.ts` or a new `saleFlow.ts`) — same "client can never influence this" discipline. Defaulting to **10%** unless told otherwise; it's a one-line constant, trivial to change later.

## Phase D — Webhook + fulfillment

Extend `apps/web/app/api/webhooks/stripe/route.ts`'s existing `checkout.session.completed`/`async_payment_succeeded` handling (lines 92-118) to branch on `order.productCode`. Keep the existing amount/currency tamper guard unchanged — it applies identically here.

New function (e.g. `packages/db/src/saleFlow.ts`, `markSaleCompleted`) for `productCode === "ITEM_SALE"`, one transaction:
- `ServiceOrder -> PAID` (reuse `transitionWithAudit`/`assertOrderTransition`, same shape as `markOrderPaidAndQueueAnalysis` used to do for its own order).
- `Listing ACTIVE -> SOLD` — new function, `packages/domain/src/states/listing.ts` already declares this transition; needs a DB-layer function that doesn't exist yet.
- `Item LISTED -> RESERVED -> CLOSED` — add `RESERVED -> CLOSED` as a new legal edge in `item.ts` (currently only `RESERVED -> MATCHED`). This distinguishes "sold online, fully paid, nothing to hand off" from the peer-handoff flow's `MATCHED -> HANDED_OFF -> CLOSED`, without adding a new `ItemStatus` value — `Listing.status = SOLD` and `ServiceOrder.productCode = ITEM_SALE` are already enough to tell the two apart in reporting.
- `LedgerEntry`: one row, `type: "ITEM_SALE_COMMISSION"`, `amountCents` = the `application_fee_amount` (what SecondCurrent actually earns — not the full sale price, matching what `LedgerEntry` already represents for the recovery-check flow: the platform's own revenue, not pass-through money). `providerReference` stores the Stripe application-fee/transfer id (this field already exists, unused today).
- Notify both parties via the existing `enqueueOutboxMessage` mechanism: seller gets something like "Your item sold. Payout is on its way.", buyer gets a purchase confirmation.
- `apps/web/app/admin/page.tsx` gets a small new "Sales" section (recent `SOLD` listings + payout status) — visibility only, no new subsystem.

**Explicitly out of scope for this pass** (flag, don't build): refunds on a sale (the dormant `REFUND_PENDING`/`REFUNDED` `OrderStatus` values exist but nothing implements a Connect-aware reversal yet), and shipping — both already deferred in `docs/architecture.md` and nothing here changes that.

## Schema changes (one migration)

- `Contact`: `+ stripeConnectAccountId String? @unique`, `+ stripeConnectOnboardedAt DateTime?`.
- `ConversationState` enum: remove `WAITING_FOR_PAYMENT`, `ORDER_PAID`.
- `ItemStatus` enum: remove `WAITING_FOR_PAYMENT`.
- `ServiceOrder.productCode`: no schema change (already a plain `String`) — just a new value, `"ITEM_SALE"`, used in code.
- `ListingStatus.SOLD`: already exists, no change.
- No new models.

## Verification

- `pnpm format:check && pnpm lint && pnpm check:copy && pnpm typecheck && pnpm test && pnpm build` after each phase, per this repo's standing rule — do not move to the next phase on a failing run.
- Mock-mode end-to-end: text `SELL`, send 3 mock photos, confirm no payment-link text is sent and `ANALYSIS_STARTED_TEXT` goes out instead; confirm the item still reaches `LISTED` after replying `APPROVE`, with no `ServiceOrder` ever created for it.
- Seller-payout mock/live smoke: confirm the Connect onboarding text sends on `APPROVE`, and that `/item/[slug]` shows no Buy button until `stripeConnectOnboardedAt` is set.
- Buyer flow: use the `browse` tool (or Playwright) to load `/browse`, click into an active listing, click Buy, complete a Stripe test-mode Connect checkout, confirm the webhook flips `Listing -> SOLD`, `Item -> CLOSED`, creates the `LedgerEntry`, and both parties receive their SMS.
- Confirm the deleted recovery-check route (`/api/checkout/recovery-check`) actually 404s and no remaining code references `RECOVERY_CHECK_PRICE_CENTS`/`createRecoveryCheckOrder` (`grep -r` after deletion).
