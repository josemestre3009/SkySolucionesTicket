import { DailyTicketOutcome, Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { buildParticipantSnapshot, canTechnicianOperate, executionAllowed, executionTimestamp, missingNotDoneContext } from '../src/modules/daily-teams/daily-execution';

describe('daily execution snapshot', () => {
  it('freezes unique members with their role at the time', () => {
    const member = { technician: { id: 'tech-1', name: 'Ana', role: Role.TECHNICIAN } };
    expect(buildParticipantSnapshot([member, member])).toEqual([{ userId: 'tech-1', name: 'Ana', role: Role.TECHNICIAN }]);
  });

  it('requires a structured reason for NOT_DONE and leaves the note optional', () => {
    expect(missingNotDoneContext(DailyTicketOutcome.NOT_DONE, undefined)).toBe(true);
    expect(missingNotDoneContext(DailyTicketOutcome.NOT_DONE, ' ')).toBe(true);
    expect(missingNotDoneContext(DailyTicketOutcome.NOT_DONE, 'reason-1')).toBe(false);
    expect(missingNotDoneContext(DailyTicketOutcome.DONE, undefined)).toBe(false);
  });

  it('only lets a technician operate today and only as a member', () => {
    const today = new Date('2026-11-03T00:00:00.000Z');
    expect(canTechnicianOperate(today, today, true)).toBe(true);
    expect(canTechnicianOperate(today, today, false)).toBe(false);
    expect(canTechnicianOperate(new Date('2026-11-02T00:00:00.000Z'), today, true)).toBe(false);
  });

  it('accepts a late offline action only for its visit day inside the sync window', () => {
    const workDate = new Date('2026-11-03T00:00:00.000Z');
    const now = new Date('2026-11-04T15:00:00.000Z');
    expect(executionAllowed(workDate, new Date('2026-11-03T23:30:00.000Z'), now, 'America/Bogota')).toBe(true);
    expect(executionAllowed(workDate, new Date('2026-11-02T23:30:00.000Z'), now, 'America/Bogota')).toBe(false);
    expect(executionAllowed(new Date('2026-11-05T00:00:00.000Z'), now, now, 'America/Bogota')).toBe(false);
  });

  it('rejects future timestamps, old actions and invalid dates', () => {
    const workDate = new Date('2026-11-03T00:00:00.000Z');
    const now = new Date('2026-11-03T15:00:00.000Z');
    expect(executionAllowed(workDate, new Date('2026-11-03T15:01:00.000Z'), now, 'America/Bogota')).toBe(true);
    expect(executionAllowed(workDate, new Date('2026-11-03T15:10:00.000Z'), now, 'America/Bogota')).toBe(false);
    expect(executionAllowed(new Date('2026-11-01T00:00:00.000Z'), new Date('2026-11-01T12:00:00.000Z'), now, 'America/Bogota')).toBe(false);
    expect(() => executionTimestamp('not-a-date')).toThrow('Fecha de ejecución inválida.');
    expect(executionTimestamp(undefined, now)).toBe(now);
  });
});
