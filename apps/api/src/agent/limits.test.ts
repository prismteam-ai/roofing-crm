import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_LIMITS,
  AgentAdmission,
  AgentLimitError,
  budgetEmbeddings,
  budgetToolResult,
} from './limits.js';

describe('anonymous agent admission', () => {
  it('bounds minute/day admissions with precise retry windows', () => {
    let now = 0;
    const gate = new AgentAdmission({ perMinute: 2, perDay: 3, concurrency: 1 }, () => now);
    gate.acquire()();
    gate.acquire()();
    expect(() => gate.acquire()).toThrow(AgentLimitError);
    try {
      gate.acquire();
    } catch (e) {
      expect((e as AgentLimitError).retryAfterSeconds).toBe(60);
    }
    now = 60_000;
    gate.acquire()();
    try {
      gate.acquire();
    } catch (e) {
      expect((e as AgentLimitError).retryAfterSeconds).toBe(86_340);
    }
    now = 86_400_000;
    expect(() => gate.acquire()()).not.toThrow();
  });
  it('bounds concurrency and releases an admission only once', () => {
    const gate = new AgentAdmission({ perMinute: 10, perDay: 10, concurrency: 1 });
    const done = gate.acquire();
    expect(() => gate.acquire()).toThrow(/busy/);
    done();
    done();
    const next = gate.acquire();
    expect(() => gate.acquire()).toThrow(/busy/);
    next();
  });
});
it('enforces cumulative embedding limits before invoking the provider', async () => {
  const embed = vi.fn(async (texts: string[]) => texts.map(() => [1]));
  const budget = budgetEmbeddings({ model: 'fake', embed });
  await budget.embed(['a']);
  await expect(budget.embed(['x'.repeat(AGENT_LIMITS.embeddingCharacters)])).rejects.toThrow(
    /embedding budget/,
  );
  expect(embed).toHaveBeenCalledTimes(1);
  const countBudget = budgetEmbeddings({ model: 'fake', embed });
  await expect(
    countBudget.embed(Array.from({ length: AGENT_LIMITS.embeddingTexts + 1 }, () => 'a')),
  ).rejects.toThrow(/embedding budget/);
  expect(embed).toHaveBeenCalledTimes(1);
});

it('bounds tool payloads before they grow the model input', () => {
  expect(budgetToolResult({ source: 'citation' })).toEqual({ source: 'citation' });
  expect(() => budgetToolResult({ text: 'x'.repeat(AGENT_LIMITS.toolResultCharacters) })).toThrow(
    /model input budget/,
  );
});
