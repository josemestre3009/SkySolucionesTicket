import { DailyTicketOutcome, Prisma, TicketStatus } from '@prisma/client';
import { currentPlanningWorkDate } from './planning-date';

export const STALE_VISIT_NOTE = 'Cierre automático: sin resultado registrado al cierre de la jornada.';
export const STALE_VISIT_BATCH_SIZE = 100;

// ponytail: lazy close on first use of the day, no cron. Move to a scheduled job only if visits must close without traffic.
export async function closeStaleVisits(tx: Prisma.TransactionClient, workDate = currentPlanningWorkDate(), now = new Date()) {
  const candidates = await tx.dailyTeamTicket.findMany({
    where: { outcome: DailyTicketOutcome.PENDING, workDate: { lt: workDate } },
    select: { id: true, ticketId: true, dailyTeamId: true, workDate: true },
    orderBy: { workDate: 'asc' },
    take: STALE_VISIT_BATCH_SIZE,
  });
  if (!candidates.length) return 0;
  // Same lock order as assign/changeStatus: ticket rows ascending before touching their visits.
  const ticketIds = [...new Set(candidates.map((visit) => visit.ticketId))].sort();
  const visitsByTicket = new Map<string, typeof candidates>();
  for (const visit of candidates) visitsByTicket.set(visit.ticketId, [...(visitsByTicket.get(visit.ticketId) ?? []), visit]);
  await tx.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" = ANY(${ticketIds}::uuid[]) ORDER BY "id" FOR UPDATE`;
  let closed = 0;
  for (const ticketId of ticketIds) {
    const visits = visitsByTicket.get(ticketId)!;
    const result = await tx.dailyTeamTicket.updateMany({
      where: { id: { in: visits.map((visit) => visit.id) }, outcome: DailyTicketOutcome.PENDING, workDate: { lt: workDate } },
      data: { outcome: DailyTicketOutcome.NOT_DONE, outcomeNote: STALE_VISIT_NOTE, completedAt: now },
    });
    if (!result.count) continue;
    closed += result.count;
    const [remainingStale, later] = await Promise.all([
      tx.dailyTeamTicket.count({ where: { ticketId, outcome: DailyTicketOutcome.PENDING, workDate: { lt: workDate } } }),
      tx.dailyTeamTicket.count({
        where: { ticketId, workDate: { gte: workDate }, OR: [{ startedAt: { not: null } }, { outcome: { not: DailyTicketOutcome.PENDING } }] },
      }),
    ]);
    if (!remainingStale && !later) {
      // Only a started ticket is reset: a note set by a concurrent change is never overwritten.
      await tx.ticket.updateMany({
        where: { id: ticketId, status: TicketStatus.IN_PROGRESS },
        data: { status: TicketStatus.PENDING, resolvedAt: null, pendingReasonId: null, pendingNote: STALE_VISIT_NOTE },
      });
    }
    const dates = [...new Set(visits.map((visit) => visit.workDate.toISOString().slice(0, 10)))];
    await tx.ticketEvent.create({
      data: { ticketId, type: 'DAILY_TICKET_AUTO_CLOSED', data: { note: STALE_VISIT_NOTE, dates } },
    });
  }
  return closed;
}
