-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('ACTIVE', 'OPTED_OUT', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM ('NEW', 'WAITING_FOR_CONSENT', 'WAITING_FOR_PHOTOS', 'WAITING_FOR_PAYMENT', 'ORDER_PAID', 'ANALYZING', 'WAITING_FOR_MORE_EVIDENCE', 'WAITING_FOR_HUMAN_REVIEW', 'RESULT_READY', 'DELIVERED', 'CLOSED', 'OPTED_OUT', 'BLOCKED', 'ERROR');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('RECEIVED', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaLabel" AS ENUM ('FULL_ITEM', 'CONNECTOR', 'LABEL', 'DAMAGE', 'POWER_ON', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'CHECKOUT_CREATED', 'PAID', 'FULFILLING', 'COMPLETED', 'EXPIRED', 'CANCELED', 'REFUND_PENDING', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('INTAKE', 'WAITING_FOR_PAYMENT', 'QUEUED', 'ANALYZING', 'WAITING_FOR_EVIDENCE', 'WAITING_FOR_REVIEW', 'FINALIZING', 'READY', 'LISTED', 'RESERVED', 'MATCHED', 'HANDED_OFF', 'CLOSED', 'REJECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "SafetyStatus" AS ENUM ('CLEAR', 'NEEDS_REVIEW', 'DO_NOT_LIST');

-- CreateEnum
CREATE TYPE "DispositionRoute" AS ENUM ('RESELL', 'DONATE', 'REPAIR', 'RECYCLE', 'NEEDS_MORE_EVIDENCE', 'DO_NOT_LIST');

-- CreateEnum
CREATE TYPE "StudyType" AS ENUM ('ITEM_VERIFICATION', 'PRODUCT_DIAGNOSTIC', 'BLIND_COMPARISON');

-- CreateEnum
CREATE TYPE "StudyStatus" AS ENUM ('DRAFT', 'CREATED_AT_PROVIDER', 'LAUNCHED', 'COLLECTING', 'READY_TO_AGGREGATE', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ReviewResponseStatus" AS ENUM ('RECEIVED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RESERVED', 'SOLD', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DemandStatus" AS ENUM ('OPEN', 'MATCHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PROPOSED', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "EvaluationVariant" AS ENUM ('BASELINE', 'REVISED');

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "phoneCiphertext" TEXT NOT NULL,
    "status" "ContactStatus" NOT NULL DEFAULT 'ACTIVE',
    "linqChatId" TEXT,
    "consentedAt" TIMESTAMP(3),
    "optedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "state" "ConversationState" NOT NULL DEFAULT 'NEW',
    "activeItemId" TEXT,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "text" TEXT,
    "normalizedCommand" TEXT,
    "rawPayload" JSONB,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "ownerContactId" TEXT NOT NULL,
    "status" "ItemStatus" NOT NULL DEFAULT 'INTAKE',
    "sellerDescription" TEXT,
    "category" TEXT,
    "weightGrams" INTEGER,
    "activePolicyVersion" TEXT NOT NULL,
    "currentAnalysisId" TEXT,
    "finalRoute" "DispositionRoute",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "messageId" TEXT,
    "kind" "MediaKind" NOT NULL,
    "label" "MediaLabel" NOT NULL DEFAULT 'OTHER',
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sourceProviderId" TEXT,
    "metadataRemovedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "humanBudgetCents" INTEGER NOT NULL DEFAULT 0,
    "checkoutSessionId" TEXT,
    "paymentId" TEXT,
    "checkoutUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "providerReference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "rawOutput" JSONB,
    "normalizedOutput" JSONB,
    "identityConfidence" DOUBLE PRECISION,
    "safetyStatus" "SafetyStatus",
    "reviewDecision" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceRequest" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "analysisRunId" TEXT,
    "requestedLabels" JSONB NOT NULL,
    "reasonCodes" JSONB NOT NULL,
    "promptText" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestNumber" INTEGER NOT NULL,
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewStudy" (
    "id" TEXT NOT NULL,
    "itemId" TEXT,
    "type" "StudyType" NOT NULL,
    "status" "StudyStatus" NOT NULL DEFAULT 'DRAFT',
    "templateVersion" TEXT NOT NULL,
    "publicTokenHash" TEXT NOT NULL,
    "externalOpportunityId" TEXT,
    "targetParticipants" INTEGER NOT NULL,
    "approvedResponses" INTEGER NOT NULL DEFAULT 0,
    "quotedCostCents" INTEGER,
    "actualCostCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "configuration" JSONB NOT NULL,
    "launchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewResponse" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "externalSubmissionId" TEXT NOT NULL,
    "externalTaskId" TEXT,
    "status" "ReviewResponseStatus" NOT NULL DEFAULT 'RECEIVED',
    "answers" JSONB,
    "qualityFlags" JSONB,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryPassport" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "publicSlug" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "brand" TEXT,
    "modelName" TEXT,
    "category" TEXT NOT NULL,
    "connector" TEXT,
    "powerText" TEXT,
    "conditionGrade" TEXT NOT NULL,
    "identityConfidence" DOUBLE PRECISION NOT NULL,
    "safetyStatus" "SafetyStatus" NOT NULL,
    "dataRisk" TEXT NOT NULL,
    "recommendedRoute" "DispositionRoute" NOT NULL,
    "suggestedPriceCents" INTEGER,
    "knownFacts" JSONB NOT NULL,
    "unknownFacts" JSONB NOT NULL,
    "evidenceSummary" JSONB NOT NULL,
    "humanReviewCount" INTEGER NOT NULL DEFAULT 0,
    "disclaimer" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryPassport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "locationCode" TEXT NOT NULL,
    "sellerApprovedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandRequest" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "DemandStatus" NOT NULL DEFAULT 'OPEN',
    "rawText" TEXT NOT NULL,
    "structuredQuery" JSONB NOT NULL,
    "locationCode" TEXT NOT NULL,
    "maxPriceCents" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "demandRequestId" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PROPOSED',
    "score" DOUBLE PRECISION NOT NULL,
    "reasonCodes" JSONB NOT NULL,
    "sellerCodeHash" TEXT,
    "buyerCodeHash" TEXT,
    "sellerConfirmedAt" TIMESTAMP(3),
    "buyerConfirmedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "rawBody" TEXT NOT NULL,
    "rawBodySha256" TEXT NOT NULL,
    "headers" JSONB NOT NULL,
    "payload" JSONB,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "itemId" TEXT,
    "taskName" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerRunId" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyVersion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "variant" "EvaluationVariant" NOT NULL,
    "metrics" JSONB NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductChange" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "humanFindingId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "finding" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "appliedPolicyKey" TEXT,
    "appliedPolicyVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanFinding" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "sourceResponseId" TEXT,
    "code" TEXT NOT NULL,
    "findingText" TEXT NOT NULL,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumanFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpactEvent" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "valueCents" INTEGER,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImpactEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "itemId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_phoneHash_key" ON "Contact"("phoneHash");

-- CreateIndex
CREATE INDEX "Conversation_contactId_state_idx" ON "Conversation"("contactId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Message_providerMessageId_key" ON "Message"("providerMessageId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Item_publicId_key" ON "Item"("publicId");

-- CreateIndex
CREATE INDEX "Item_ownerContactId_status_idx" ON "Item"("ownerContactId", "status");

-- CreateIndex
CREATE INDEX "Item_status_createdAt_idx" ON "Item"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_objectKey_key" ON "MediaAsset"("objectKey");

-- CreateIndex
CREATE INDEX "MediaAsset_itemId_label_idx" ON "MediaAsset"("itemId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_itemId_sha256_key" ON "MediaAsset"("itemId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_checkoutSessionId_key" ON "ServiceOrder"("checkoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_paymentId_key" ON "ServiceOrder"("paymentId");

-- CreateIndex
CREATE INDEX "ServiceOrder_contactId_status_idx" ON "ServiceOrder"("contactId", "status");

-- CreateIndex
CREATE INDEX "ServiceOrder_itemId_status_idx" ON "ServiceOrder"("itemId", "status");

-- CreateIndex
CREATE INDEX "LedgerEntry_orderId_createdAt_idx" ON "LedgerEntry"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisRun_itemId_status_idx" ON "AnalysisRun"("itemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisRun_itemId_version_key" ON "AnalysisRun"("itemId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceRequest_itemId_requestNumber_key" ON "EvidenceRequest"("itemId", "requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewStudy_publicTokenHash_key" ON "ReviewStudy"("publicTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewStudy_externalOpportunityId_key" ON "ReviewStudy"("externalOpportunityId");

-- CreateIndex
CREATE INDEX "ReviewStudy_itemId_status_idx" ON "ReviewStudy"("itemId", "status");

-- CreateIndex
CREATE INDEX "ReviewStudy_type_status_idx" ON "ReviewStudy"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewResponse_externalSubmissionId_key" ON "ReviewResponse"("externalSubmissionId");

-- CreateIndex
CREATE INDEX "ReviewResponse_studyId_status_idx" ON "ReviewResponse"("studyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryPassport_itemId_key" ON "RecoveryPassport"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryPassport_publicSlug_key" ON "RecoveryPassport"("publicSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_itemId_key" ON "Listing"("itemId");

-- CreateIndex
CREATE INDEX "Listing_status_locationCode_idx" ON "Listing"("status", "locationCode");

-- CreateIndex
CREATE INDEX "DemandRequest_status_locationCode_idx" ON "DemandRequest"("status", "locationCode");

-- CreateIndex
CREATE INDEX "Match_status_expiresAt_idx" ON "Match"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Match_listingId_demandRequestId_key" ON "Match"("listingId", "demandRequestId");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_receivedAt_idx" ON "WebhookEvent"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_externalEventId_key" ON "WebhookEvent"("provider", "externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxMessage_idempotencyKey_key" ON "OutboxMessage"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_nextAttemptAt_idx" ON "OutboxMessage"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRun_idempotencyKey_key" ON "WorkflowRun"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRun_providerRunId_key" ON "WorkflowRun"("providerRunId");

-- CreateIndex
CREATE INDEX "WorkflowRun_status_createdAt_idx" ON "WorkflowRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PolicyVersion_key_active_idx" ON "PolicyVersion"("key", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyVersion_key_version_key" ON "PolicyVersion"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MetricSnapshot_studyId_variant_key" ON "MetricSnapshot"("studyId", "variant");

-- CreateIndex
CREATE INDEX "ProductChange_studyId_createdAt_idx" ON "ProductChange"("studyId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductChange_humanFindingId_idx" ON "ProductChange"("humanFindingId");

-- CreateIndex
CREATE INDEX "HumanFinding_studyId_createdAt_idx" ON "HumanFinding"("studyId", "createdAt");

-- CreateIndex
CREATE INDEX "HumanFinding_sourceResponseId_idx" ON "HumanFinding"("sourceResponseId");

-- CreateIndex
CREATE INDEX "ImpactEvent_type_createdAt_idx" ON "ImpactEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_activeItemId_fkey" FOREIGN KEY ("activeItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_ownerContactId_fkey" FOREIGN KEY ("ownerContactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRequest" ADD CONSTRAINT "EvidenceRequest_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewStudy" ADD CONSTRAINT "ReviewStudy_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewResponse" ADD CONSTRAINT "ReviewResponse_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "ReviewStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryPassport" ADD CONSTRAINT "RecoveryPassport_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandRequest" ADD CONSTRAINT "DemandRequest_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_demandRequestId_fkey" FOREIGN KEY ("demandRequestId") REFERENCES "DemandRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxMessage" ADD CONSTRAINT "OutboxMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "ReviewStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductChange" ADD CONSTRAINT "ProductChange_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "ReviewStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductChange" ADD CONSTRAINT "ProductChange_humanFindingId_fkey" FOREIGN KEY ("humanFindingId") REFERENCES "HumanFinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanFinding" ADD CONSTRAINT "HumanFinding_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "ReviewStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanFinding" ADD CONSTRAINT "HumanFinding_sourceResponseId_fkey" FOREIGN KEY ("sourceResponseId") REFERENCES "ReviewResponse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactEvent" ADD CONSTRAINT "ImpactEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

