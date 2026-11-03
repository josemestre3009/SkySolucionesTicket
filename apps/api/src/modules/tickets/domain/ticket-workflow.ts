import { TicketStatus } from '@prisma/client';

const transitions: Record<TicketStatus, TicketStatus[]> = {
  PENDING: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['PENDING', 'RESOLVED'],
  RESOLVED: ['IN_PROGRESS'],
};

export function canTransition(from: TicketStatus, to: TicketStatus) {
  return transitions[from].includes(to);
}
