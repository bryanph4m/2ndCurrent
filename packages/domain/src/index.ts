export { InvalidTransitionError } from "./errors/InvalidTransitionError";
export { ConcurrencyError } from "./errors/ConcurrencyError";
export { assertTransition } from "./services/transitions";

export {
  CONVERSATION_TRANSITIONS,
  assertConversationTransition,
  type ConversationState,
} from "./states/conversation";
export { ORDER_TRANSITIONS, assertOrderTransition, type OrderState } from "./states/order";
export { ITEM_TRANSITIONS, assertItemTransition, type ItemState } from "./states/item";
export { STUDY_TRANSITIONS, assertStudyTransition, type StudyState } from "./states/study";
export { LISTING_TRANSITIONS, assertListingTransition, type ListingState } from "./states/listing";
export { MATCH_TRANSITIONS, assertMatchTransition, type MatchState } from "./states/match";

export { ImageObservationSchema, type ImageObservation } from "./schemas/imageObservation";
export { PHOTO_LABEL_ORDER, type MediaLabel } from "./schemas/media";

export { hashPhone, encryptPhone, decryptPhone } from "./crypto/phone";
export {
  signConversationToken,
  verifyConversationToken,
  type ConversationTokenPayload,
} from "./crypto/conversationToken";

export { parseCommand, type ParsedCommand } from "./commands/parseCommand";
export { isOptOutText } from "./commands/optOut";
export {
  RuntimeEnvironmentSchema,
  parseRuntimeEnvironment,
  type RuntimeEnvironment,
} from "./config/runtimeEnv";

export {
  CONSENT_AND_PHOTO_INSTRUCTIONS_TEXT,
  CHECKOUT_LINK_PREFIX,
  OPT_OUT_CONFIRMATION_TEXT,
  PAYMENT_RECEIVED_TEXT,
  ANALYSIS_STARTED_TEXT,
  HUMAN_REVIEW_STARTED_TEXT,
  RESULT_READY_PREFIX,
  LISTING_APPROVAL_TEXT,
  LISTING_APPROVED_TEXT,
  LISTING_DECLINED_TEXT,
  BUYER_MATCH_PREFIX,
  HANDOFF_CODE_PREFIX,
  HANDOFF_WAITING_TEXT,
  HANDOFF_COMPLETE_TEXT,
  NO_MATCH_TEXT,
  TECHNICAL_ERROR_TEXT,
} from "./messaging/templates";

export {
  DemandQuerySchema,
  parseDemandQuery,
  isListingEligible,
  scoreListing,
  findBestMatch,
  type DemandQuery,
  type MatchableListing,
  type ScoredMatch,
} from "./marketplace/demand";

export {
  processInboundLinqEvent,
  type IntakeContact,
  type IntakeContactStatus,
  type IntakeConversation,
  type IntakeCrypto,
  type IntakeOutcome,
  type IntakePorts,
  type InboundLinqEvent,
} from "./services/linqIntake";

export {
  normalizeItemClass,
  isUnsupportedItemClass,
  type ItemClass,
  type SupportedItemClass,
  type UnsupportedItemClass,
} from "./analysis/itemClass";
export {
  mergeImageObservations,
  conditionGradeSpread,
  type MergedObservation,
} from "./analysis/merge";
export {
  evaluateSafety,
  evaluateDataRisk,
  type SafetyResult,
  type SafetyStatusValue,
  type DataRiskResult,
} from "./analysis/safety";
export { evaluateEvidenceCompleteness, type EvidenceResult } from "./analysis/evidence";
export {
  decideHumanReview,
  EXPECTED_CONFIDENCE_AFTER_REVIEW,
  type ReviewDecision,
  type ReviewDecisionInput,
} from "./analysis/reviewDecision";
export { estimateRouteValue, type PriceCatalogEntry, type PriceEstimate } from "./analysis/price";
export {
  decideRoute,
  type RouteDecision,
  type DispositionRoute,
  type ConditionGrade,
} from "./analysis/route";
export {
  buildPassportFields,
  RECOVERY_PASSPORT_DISCLAIMER,
  type PassportFields,
} from "./analysis/passport";
export { analyzeItem, type AnalyzeItemInput, type AnalyzeItemResult } from "./analysis/analyzeItem";

export {
  StudyResponseAnswersSchema,
  StudyResponseRequestSchema,
  type StudyResponseAnswers,
  type StudyResponseRequest,
} from "./schemas/studyResponse";

export {
  aggregateCategorical,
  aggregateRating,
  collectFreeText,
  type CategoricalTally,
  type RatingSummary,
} from "./review/aggregate";
export {
  applyReviewOutcome,
  type ReviewAggregate,
  type ReviewOutcome,
} from "./review/applyReviewOutcome";

export {
  PRODUCT_CHANGE_CATALOG,
  ProductChangeCodeSchema,
  MeasurementResponseSchema,
  calculateStudyMetrics,
  assignBlindComparisonOrder,
  type ProductChangeCode,
  type MeasurementResponse,
  type StudyMetricCounts,
  type StudyMetrics,
} from "./measurement/study";
