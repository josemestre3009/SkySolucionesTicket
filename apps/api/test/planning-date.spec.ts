import { describe, expect, it } from 'vitest';
import { planningDate } from '../src/modules/daily-teams/planning-date';

describe('planningDate', () => {
  it('accepts real civil dates and rejects impossible ones', () => {
    expect(planningDate('2026-11-03').toISOString()).toBe('2026-11-03T00:00:00.000Z');
    expect(() => planningDate('2026-02-31')).toThrow('Fecha inválida.');
  });
});
