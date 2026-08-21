export type {
  DeliveryEventType,
  DnsHealthResult,
  DnsRecordStatus,
  DnsResolver,
  EmailClient,
  RenderedEmail,
  ResendDeliveryEventType,
  SendEmailParams,
  SendEmailResult,
  SequenceEmailVars,
  SequenceLead,
  SequenceStep,
  StoredSentEmail,
} from "./types";

export {
  SEQUENCE_STEPS,
} from "./types";

export {
  buildListUnsubscribeHeaders,
  buildThreadingHeaders,
  clearFakeSentEmails,
  createEmailClient,
  fromAddress,
  getEmailClient,
  getFakeSentEmails,
  plusAddress,
  resetEmailClientForTests,
} from "./client";

export { checkDomainDnsRecords, checkSendingDomainDns } from "./dns";

export {
  renderSequenceEmail,
  renderDay0Email,
  renderBumpEmail,
  renderFinalEmail,
  normalizeBusinessName,
  resolveOwnerFirstName,
  buildObservation,
  validateLockedCopy,
  validateDay0LockedCopy,
  validateObservationSentence,
  LOCKED_COPY_MARKERS,
  DAY0_LOCKED_PARAGRAPHS,
  createPersonalizationLlm,
  personalizeLead,
  FakePersonalizationLlm,
  LivePersonalizationLlm,
  parsePersonalizationSlots,
  type RenderedSequenceEmail,
  type PersonalizationInput,
  type PersonalizationLlm,
  type PersonalizationSlots,
  type PersonalizedLeadVars,
} from "./templates/index";

export {
  HARD_GLOBAL_DAILY_CAP,
  DEFAULT_DOMAIN_DAILY_CAP,
  clampCampaignDailyCap,
  clampGlobalDailyCap,
  countsTowardDailyCap,
  daysAfterLastTouchForStep,
  daysAfterSequenceStartForStep,
  decideSequenceSend,
  idempotencyKeyForSend,
  isDueForStep,
  isSequenceComplete,
  isSequenceStep,
  isStopStatus,
  nextDueStep,
  nextStep,
  recipientDomain,
  sentStepsFromHistory,
  shouldStopSequence,
  startOfUtcDay,
  stopReasonForLead,
  type CampaignRunStatus,
  type SequenceDecisionInput,
  type SequenceSendDecision,
  type SequenceSkipReason,
} from "./sequence";

export {
  createUnsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from "./unsubscribe";

export {
  extractLeadIdFromPlusAddress,
  isHardBouncePayload,
  isResendDeliveryEventType,
  mapResendEventToDeliveryType,
  parseResendWebhookEvent,
  shouldSuppressForEvent,
  verifyResendWebhook,
  verifyResendWebhookSignature,
  type ParsedResendWebhookEvent,
  type ResendWebhookPayload,
} from "./events";
