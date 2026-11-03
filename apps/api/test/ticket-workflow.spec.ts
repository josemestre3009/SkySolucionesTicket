import { describe, expect, it } from 'vitest';
import { canTransition } from '../src/modules/tickets/domain/ticket-workflow';

describe('ticket workflow', () => {
  it('permite el flujo operativo y bloquea saltos', () => {
    expect(canTransition('PENDING', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'RESOLVED')).toBe(true);
    expect(canTransition('PENDING', 'RESOLVED')).toBe(true);
    expect(canTransition('RESOLVED', 'IN_PROGRESS')).toBe(true);
  });
});
