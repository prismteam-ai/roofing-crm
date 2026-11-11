import type { EmbeddingService } from '@roofing/rag';

export const AGENT_LIMITS = {
  perMinute: 12,
  perDay: 200,
  concurrency: 2,
  steps: 4,
  toolCalls: 4,
  outputTokensPerStep: 800,
  modelTimeoutMs: 30_000,
  toolResultCharacters: 30_000,
  embeddingTexts: 1000,
  embeddingCharacters: 400_000,
} as const;

export class AgentLimitError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = 'AgentLimitError';
  }
}

/** Global anonymous-demo budget; caller-controlled IP/workspace headers never identify a quota. */
export class AgentAdmission {
  private active = 0;
  private minute = { count: 0, reset: 0 };
  private day = { count: 0, reset: 0 };
  constructor(
    private readonly limits: {
      perMinute: number;
      perDay: number;
      concurrency: number;
    } = AGENT_LIMITS,
    private readonly now: () => number = Date.now,
  ) {}
  acquire(): () => void {
    const now = this.now();
    if (this.minute.reset <= now) this.minute = { count: 0, reset: now + 60_000 };
    if (this.day.reset <= now) this.day = { count: 0, reset: now + 86_400_000 };
    for (const [window, limit] of [
      [this.day, this.limits.perDay],
      [this.minute, this.limits.perMinute],
    ] as const) {
      if (window.count >= limit) {
        const retry = Math.max(1, Math.ceil((window.reset - now) / 1000));
        throw new AgentLimitError(
          `Public agent budget reached. Retry in ${retry} seconds. Map search and leads remain available.`,
          retry,
        );
      }
    }
    if (this.active >= this.limits.concurrency)
      throw new AgentLimitError(
        'The agent is busy. Retry in 5 seconds. Map search and leads remain available.',
        5,
      );
    this.minute.count++;
    this.day.count++;
    this.active++;
    let released = false;
    return () => {
      if (!released) {
        this.active--;
        released = true;
      }
    };
  }
}

/** Bound paid embedding work across the entire question, including repeated tool executions. */
export function budgetEmbeddings(delegate: EmbeddingService): EmbeddingService {
  let texts = 0;
  let characters = 0;
  return {
    model: delegate.model,
    async embed(values) {
      texts += values.length;
      characters += values.reduce((sum, text) => sum + text.length, 0);
      if (texts > AGENT_LIMITS.embeddingTexts || characters > AGENT_LIMITS.embeddingCharacters)
        throw new Error('Question exceeded the embedding budget; narrow the area or filters.');
      return delegate.embed(values);
    },
  };
}

/** Bound model input growth from external tool results as well as generated output. */
export function budgetToolResult<T>(value: T): T {
  if ((JSON.stringify(value) ?? '').length > AGENT_LIMITS.toolResultCharacters)
    throw new Error('Tool result exceeded the model input budget; narrow the request.');
  return value;
}
