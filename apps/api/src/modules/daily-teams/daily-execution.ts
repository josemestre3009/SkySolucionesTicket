import { BadRequestException } from '@nestjs/common';
import { DailyTicketOutcome, Role } from '@prisma/client';
import { currentPlanningDate } from './planning-date';

type TeamMember = { technician: { id: string; name: string; role: Role } };

// ponytail: 48h covers a normal offline night/next-day sync; widen only if field crews need longer.
const LATE_SYNC_WINDOW_MS = 48 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export function buildParticipantSnapshot(members: TeamMember[]) {
  const seen = new Set<string>();
  return members.flatMap(({ technician }) => {
    if (seen.has(technician.id)) return [];
    seen.add(technician.id);
    return [{ userId: technician.id, name: technician.name, role: technician.role }];
  });
}

// NOT_DONE always needs the structured reason; the free-text note stays optional.
export function missingNotDoneContext(outcome: DailyTicketOutcome, pendingReasonId?: string | null) {
  return outcome === DailyTicketOutcome.NOT_DONE && !pendingReasonId?.trim();
}

export function canTechnicianOperate(workDate: Date, today: Date, isMember: boolean) {
  return isMember && workDate.getTime() === today.getTime();
}

export function executionTimestamp(value?: string, now = new Date()) {
  if (!value) return now;
  const executedAt = new Date(value);
  if (Number.isNaN(executedAt.valueOf())) throw new BadRequestException('Fecha de ejecución inválida.');
  return executedAt;
}

// Offline actions may arrive late; accept them only for the visit's own day (or today) inside a short window.
export function executionAllowed(workDate: Date, executedAt: Date, now = new Date(), timeZone = process.env.APP_TIMEZONE ?? 'America/Bogota') {
  if (executedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) return false;
  if (now.getTime() - executedAt.getTime() > LATE_SYNC_WINDOW_MS) return false;
  const workDay = workDate.toISOString().slice(0, 10);
  return workDay === currentPlanningDate(now, timeZone) || workDay === currentPlanningDate(executedAt, timeZone);
}
