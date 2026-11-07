import { describe, expect, it } from 'vitest';
import { blocksGenericTransition, canTransition } from '../src/modules/tickets/domain/ticket-workflow';

describe('ticket workflow', () => {
  it('permite el flujo operativo y bloquea saltos', () => {
    expect(canTransition('PENDING', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'RESOLVED')).toBe(true);
    expect(canTransition('PENDING', 'RESOLVED')).toBe(true);
    expect(canTransition('RESOLVED', 'IN_PROGRESS')).toBe(true);
  });

  it('exige el flujo diario mientras hay una visita planificada', () => {
    expect(blocksGenericTransition(1, 'PENDING', 'RESOLVED')).toBe(true);
    expect(blocksGenericTransition(1, 'IN_PROGRESS', 'PENDING')).toBe(true);
    expect(blocksGenericTransition(1, 'PENDING', 'PENDING')).toBe(false);
    expect(blocksGenericTransition(0, 'PENDING', 'RESOLVED')).toBe(false);
  });
});
