import type { Processor } from '@mastra/core/processors';

const COMMITMENT_PATTERNS = [
  /\b(refund|credit|reimburse|chargeback)\b/i,
  /\b(guarantee[ds]?|promise|commit) (?:that|to|you)\b/i,
  /\b(100%|always|never) (?:uptime|available|working)\b/i,
  /\bwe will (?:waive|comp|discount|cancel)\b/i,
  /\b(SLA|service level agreement)\b/i,
];

export class UnauthorizedPromiseGuardrail implements Processor {
  id = 'unauthorized-promise-guardrail';

  async processOutputStep({
    text,
    abort,
    retryCount,
    finishReason,
    messageList,
  }: Parameters<NonNullable<Processor['processOutputStep']>>[0]) {
    if (finishReason === 'tool-calls' || !text) return messageList;

    const triggered = COMMITMENT_PATTERNS.filter((p) => p.test(text));
    if (triggered.length === 0) return messageList;

    if (retryCount < 2) {
      abort(
        'You made a commitment the support agent is not authorized to make ' +
          '(refund, credit, guarantee, or SLA promise). Do not commit on the company\'s behalf — ' +
          'call the escalateToHuman tool with a precise summary so a human agent can approve.',
        {
          retry: true,
          metadata: { processor: this.id, patterns: triggered.map(String) },
        },
      );
    }

    abort(
      'This request needs approval from a human support agent. It has been flagged for escalation.',
      { metadata: { processor: this.id, patterns: triggered.map(String) } },
    );
    return messageList;
  }
}
