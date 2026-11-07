import { TicketStatus } from '@prisma/client';

const transitions: Record<TicketStatus, TicketStatus[]> = {
  PENDING: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['PENDING', 'RESOLVED'],
  RESOLVED: ['IN_PROGRESS'],
};

export function canTransition(from: TicketStatus, to: TicketStatus) {
  return transitions[from].includes(to);
}

export function blocksGenericTransition(pendingDailyVisits: number, from: TicketStatus, to: TicketStatus) {
  return pendingDailyVisits > 0 && from !== to;
}
