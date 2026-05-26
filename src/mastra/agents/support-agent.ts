import { Agent } from '@mastra/core/agent';
import {
  BatchPartsProcessor,
  CostGuardProcessor,
  ModerationProcessor,
  PIIDetector,
  PromptInjectionDetector,
  UnicodeNormalizer,
} from '@mastra/core/processors';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { BrandVoiceGuardrail } from '../processors/brand-voice-guardrail';
import { UnauthorizedPromiseGuardrail } from '../processors/unauthorized-promise-guardrail';
import { escalateToHuman } from '../tools/escalate-to-human';

const GUARDRAIL_MODEL = 'groq/openai/gpt-oss-120b';

export const supportAgent = new Agent({
  id: 'support-agent',
  name: 'Support Agent',
  instructions: `
    You are a customer support agent. Follow these rules strictly:

    1. **Speak as a teammate, not a chatbot.** No "As an AI..." or "I am unable to" — say what you can do.
    2. **Help, don't promise.** You answer questions, walk through workflows, and point to docs. You do NOT
       commit to refunds, credits, SLA terms, or contract changes. If the customer wants any of those,
       call the escalateToHuman tool with a precise summary.
    3. **Acknowledge gaps.** If you cannot resolve something with the information available, escalate —
       don't make it up.
    4. **Be concise.** Customers want their problem solved, not a wall of text.
    5. **Your answers are max 4 sentences**. If user asks something that needs further explaining, then,
       indicate research directions for the user to make.
  `,
  model: 'groq/openai/gpt-oss-120b',
  tools: { escalateToHuman },
  memory: new Memory({
    storage: new LibSQLStore({
      id: 'support-storage',
      url: 'file:./mastra.db',
    }),
    options: { lastMessages: 20 },
  }),
  inputProcessors: [
    new UnicodeNormalizer({
      stripControlChars: true,
      collapseWhitespace: true,
      trim: true,
    }),
    new PromptInjectionDetector({
      model: GUARDRAIL_MODEL,
      strategy: 'rewrite',
      threshold: 0.8,
      detectionTypes: ['injection', 'jailbreak', 'system-override'],
      lastMessageOnly: true,
    }),
    new PIIDetector({
      model: GUARDRAIL_MODEL,
      strategy: 'redact',
      redactionMethod: 'mask',
      threshold: 0.6,
      detectionTypes: ['email', 'phone', 'credit-card', 'ssn'],
      preserveFormat: true,
      lastMessageOnly: true,
    }),
    new ModerationProcessor({
      model: GUARDRAIL_MODEL,
      strategy: 'block',
      threshold: 0.7,
      categories: ['hate', 'harassment', 'violence', 'sexual'],
      lastMessageOnly: true,
    }),
    new CostGuardProcessor({
      maxCost: 2.0,
      scope: 'thread',
      window: '24h',
    }),
  ],
  outputProcessors: [
    new BatchPartsProcessor({ batchSize: 10, maxWaitTime: 150 }),
    new PIIDetector({
      model: GUARDRAIL_MODEL,
      strategy: 'redact',
      redactionMethod: 'placeholder',
      threshold: 0.6,
      detectionTypes: ['email', 'phone', 'credit-card', 'ssn'],
    }),
    new BrandVoiceGuardrail(),
    new UnauthorizedPromiseGuardrail(),
  ],
  maxProcessorRetries: 3,
  defaultOptions: {
    maxSteps: 10,
  },
});
