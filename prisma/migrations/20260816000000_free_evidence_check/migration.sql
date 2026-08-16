-- The evidence check is now free: photos go straight to analysis instead of
-- waiting on a Recovery Check payment, so the payment-wait states are gone
-- from both state machines. Any row still parked in a removed value is
-- moved forward first so the enum swap below can never fail against live
-- data - WAITING_FOR_PAYMENT/ORDER_PAID conversations become ANALYZING
-- (that is what free intake would have done next), and an item stuck in
-- WAITING_FOR_PAYMENT becomes QUEUED (its immediate next step today).
UPDATE "Conversation" SET "state" = 'ANALYZING' WHERE "state" IN ('WAITING_FOR_PAYMENT', 'ORDER_PAID');
UPDATE "Item" SET "status" = 'QUEUED' WHERE "status" = 'WAITING_FOR_PAYMENT';

-- ConversationState: drop WAITING_FOR_PAYMENT, ORDER_PAID
ALTER TYPE "ConversationState" RENAME TO "ConversationState_old";
CREATE TYPE "ConversationState" AS ENUM ('NEW', 'WAITING_FOR_CONSENT', 'WAITING_FOR_PHOTOS', 'ANALYZING', 'WAITING_FOR_MORE_EVIDENCE', 'WAITING_FOR_HUMAN_REVIEW', 'RESULT_READY', 'DELIVERED', 'CLOSED', 'OPTED_OUT', 'BLOCKED', 'ERROR');
ALTER TABLE "Conversation" ALTER COLUMN "state" DROP DEFAULT;
ALTER TABLE "Conversation" ALTER COLUMN "state" TYPE "ConversationState" USING ("state"::text::"ConversationState");
ALTER TABLE "Conversation" ALTER COLUMN "state" SET DEFAULT 'NEW';
DROP TYPE "ConversationState_old";

-- ItemStatus: drop WAITING_FOR_PAYMENT
ALTER TYPE "ItemStatus" RENAME TO "ItemStatus_old";
CREATE TYPE "ItemStatus" AS ENUM ('INTAKE', 'QUEUED', 'ANALYZING', 'WAITING_FOR_EVIDENCE', 'WAITING_FOR_REVIEW', 'FINALIZING', 'READY', 'LISTED', 'RESERVED', 'MATCHED', 'HANDED_OFF', 'CLOSED', 'REJECTED', 'ERROR');
ALTER TABLE "Item" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Item" ALTER COLUMN "status" TYPE "ItemStatus" USING ("status"::text::"ItemStatus");
ALTER TABLE "Item" ALTER COLUMN "status" SET DEFAULT 'INTAKE';
DROP TYPE "ItemStatus_old";
