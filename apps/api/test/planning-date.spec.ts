import { describe, expect, it } from 'vitest';
import { currentPlanningDate, planningDate } from '../src/modules/daily-teams/planning-date';

describe('planningDate', () => {
  it('accepts real civil dates and rejects impossible ones', () => {
    expect(planningDate('2026-11-03').toISOString()).toBe('2026-11-03T00:00:00.000Z');
    expect(() => planningDate('2026-02-31')).toThrow('Fecha inválida.');
  });

  it('uses the operational timezone for today', () => {
    expect(currentPlanningDate(new Date('2026-11-04T02:00:00.000Z'), 'America/Bogota')).toBe('2026-11-03');
    expect(currentPlanningDate(new Date('2026-11-03T15:00:00.000Z'), 'America/Bogota')).toBe('2026-11-03');
  });
});
