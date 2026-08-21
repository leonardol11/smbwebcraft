import { z } from "zod";

export const replyToolNames = [
  "send_reply",
  "send_preview",
  "send_payment_link",
  "mark_not_interested",
  "escalate_to_human",
] as const;

export type ReplyToolName = (typeof replyToolNames)[number];

export const sendReplySchema = z.object({
  body: z.string().min(1),
  subject: z.string().optional(),
});

export const sendPreviewSchema = z.object({
  body: z.string().min(1),
  subject: z.string().optional(),
});

export const sendPaymentLinkSchema = z.object({
  body: z.string().min(1),
  subject: z.string().optional(),
});

export const markNotInterestedSchema = z.object({
  reason: z.string().optional(),
});

export const escalateSchema = z.object({
  reason: z.string().min(1),
});

export type ToolCall = {
  name: ReplyToolName;
  input: Record<string, unknown>;
};

export const toolSchemas: Record<ReplyToolName, z.ZodType> = {
  send_reply: sendReplySchema,
  send_preview: sendPreviewSchema,
  send_payment_link: sendPaymentLinkSchema,
  mark_not_interested: markNotInterestedSchema,
  escalate_to_human: escalateSchema,
};

export function parseToolInput(name: ReplyToolName, input: unknown): Record<string, unknown> {
  return toolSchemas[name].parse(input) as Record<string, unknown>;
}
