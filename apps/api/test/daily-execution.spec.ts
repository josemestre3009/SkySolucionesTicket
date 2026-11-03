import { DailyTicketOutcome, Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { buildParticipantSnapshot, canTechnicianOperate, missingNotDoneContext } from '../src/modules/daily-teams/daily-execution';

describe('daily execution snapshot', () => {
  it('freezes unique members with their role at the time', () => {
    const member = { technician: { id: 'tech-1', name: 'Ana', role: Role.TECHNICIAN } };
    expect(buildParticipantSnapshot([member, member])).toEqual([{ userId: 'tech-1', name: 'Ana', role: Role.TECHNICIAN }]);
  });

  it('requires a reason or note for NOT_DONE', () => {
    expect(missingNotDoneContext(DailyTicketOutcome.NOT_DONE, ' ', undefined)).toBe(true);
    expect(missingNotDoneContext(DailyTicketOutcome.NOT_DONE, 'Cliente ausente', undefined)).toBe(false);
    expect(missingNotDoneContext(DailyTicketOutcome.NOT_DONE, undefined, 'reason-1')).toBe(false);
    expect(missingNotDoneContext(DailyTicketOutcome.DONE, undefined, undefined)).toBe(false);
  });

  it('only lets a technician operate today and only as a member', () => {
    const today = new Date('2026-11-03T00:00:00.000Z');
    expect(canTechnicianOperate(today, today, true)).toBe(true);
    expect(canTechnicianOperate(today, today, false)).toBe(false);
    expect(canTechnicianOperate(new Date('2026-11-02T00:00:00.000Z'), today, true)).toBe(false);
  });
});
