import { DailyTicketOutcome, Role } from '@prisma/client';

type TeamMember = { technician: { id: string; name: string; role: Role } };

export function buildParticipantSnapshot(members: TeamMember[]) {
  const seen = new Set<string>();
  return members.flatMap(({ technician }) => {
    if (seen.has(technician.id)) return [];
    seen.add(technician.id);
    return [{ userId: technician.id, name: technician.name, role: technician.role }];
  });
}

export function missingNotDoneContext(outcome: DailyTicketOutcome, note?: string | null, pendingReasonId?: string | null) {
  return outcome === DailyTicketOutcome.NOT_DONE && !note?.trim() && !pendingReasonId;
}

export function canTechnicianOperate(workDate: Date, today: Date, isMember: boolean) {
  return isMember && workDate.getTime() === today.getTime();
}
