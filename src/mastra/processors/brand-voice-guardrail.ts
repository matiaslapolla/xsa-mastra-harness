import type { Processor } from '@mastra/core/processors';

const MIN_USEFUL_CHARS = 80;

const VOICE_VIOLATIONS = [
  {
    pattern: /\bas an (ai|llm|language model|assistant)\b/i,
    feedback:
      'Drop the "As an AI..." framing. Speak as a member of the support team — direct and helpful.',
  },
  {
    pattern: /^i (don't|do not|can't|cannot) (know|find|access|browse|see)/i,
    feedback:
      'Avoid vague refusals. Search the knowledge base, look up the account, or escalate before saying you cannot help.',
  },
  {
    pattern: /\b(unfortunately|sadly),? i('m| am) (unable|not able)/i,
    feedback:
      'No theatrical apologies. State the constraint, then offer the next step the customer can take.',
  },
];

export class BrandVoiceGuardrail implements Processor {
  id = 'brand-voice-guardrail';

  async processOutputStep({
    text,
    abort,
    retryCount,
    finishReason,
    messageList,
  }: Parameters<NonNullable<Processor['processOutputStep']>>[0]) {
    if (finishReason === 'tool-calls' || !text) return messageList;

    const issues: string[] = [];

    if (text.length < MIN_USEFUL_CHARS) {
      issues.push(
        'Response is too short to be useful to the customer — expand with concrete steps.',
      );
    }

    for (const { pattern, feedback } of VOICE_VIOLATIONS) {
      if (pattern.test(text)) issues.push(feedback);
    }

    if (issues.length > 0 && retryCount < 3) {
      abort(issues.join(' '), {
        retry: true,
        metadata: { processor: this.id, issues },
      });
    }

    return messageList;
  }
}
