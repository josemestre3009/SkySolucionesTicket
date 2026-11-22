import { describe, expect, it } from 'vitest';
import { classifyOutboxFailure, summarizeOutbox } from '../../web/lib/outbox';
import type { OutboxOperation } from '../../web/lib/offline';

function operation(overrides: Partial<OutboxOperation> = {}): OutboxOperation {
  return {
    id: 'op-1',
    userId: 'user-1',
    kind: 'DAILY_OUTCOME',
    label: 'Resultado de visita',
    method: 'PATCH',
    path: '/daily-teams/team/tickets/ticket/outcome',
    body: '{}',
    createdAt: 1,
    status: 'pending',
    attempts: 0,
    ...overrides,
  };
}

describe('outbox failure policy', () => {
  it('pauses on offline, auth and transient server failures', () => {
    expect(classifyOutboxFailure({ offline: true })).toBe('pause');
    expect(classifyOutboxFailure({ status: 401 })).toBe('pause');
    expect(classifyOutboxFailure({ status: 408 })).toBe('pause');
    expect(classifyOutboxFailure({ status: 429 })).toBe('pause');
    expect(classifyOutboxFailure({ status: 500 })).toBe('pause');
    expect(classifyOutboxFailure({ status: 503 })).toBe('pause');
  });

  it('continues past permanent validation and conflict errors', () => {
    expect(classifyOutboxFailure({ status: 400 })).toBe('continue');
    expect(classifyOutboxFailure({ status: 403 })).toBe('continue');
    expect(classifyOutboxFailure({ status: 404 })).toBe('continue');
    expect(classifyOutboxFailure({ status: 409 })).toBe('continue');
    expect(classifyOutboxFailure({ status: 422 })).toBe('continue');
  });

  it('summarizes pending and blocked operations with the latest error', () => {
    expect(summarizeOutbox([])).toEqual({ pending: 0, blocked: 0, lastError: null });
    expect(summarizeOutbox([operation(), operation({ id: 'op-2', status: 'blocked', lastError: 'La visita ya fue finalizada.' })]))
      .toEqual({ pending: 2, blocked: 1, lastError: 'La visita ya fue finalizada.' });
  });
});
