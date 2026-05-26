import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const escalateToHuman = createTool({
  id: 'escalate-to-human',
  description:
    'Escalate the conversation to a human support agent. Use when the customer requests a refund, ' +
    'account changes, contract renegotiation, or any commitment beyond providing information from the knowledge base.',
  inputSchema: z.object({
    reason: z
      .string()
      .min(10)
      .describe('Why this conversation needs a human (be specific).'),
    urgency: z
      .enum(['low', 'normal', 'high'])
      .describe("Severity from the customer's perspective."),
    summary: z
      .string()
      .describe('A 1–2 sentence summary of what the customer wants.'),
  }),
  outputSchema: z.object({
    ticketId: z.string(),
    queuePosition: z.number(),
    estimatedWaitMinutes: z.number(),
  }),
  execute: async ({ urgency }) => {
    const ticketId = `T-${Date.now().toString(36).toUpperCase()}`;
    const queuePosition = urgency === 'high' ? 1 : urgency === 'normal' ? 3 : 8;
    const estimatedWaitMinutes = queuePosition * 4;
    return { ticketId, queuePosition, estimatedWaitMinutes };
  },
});
