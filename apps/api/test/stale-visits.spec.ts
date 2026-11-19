import { DailyTicketOutcome, TicketStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { closeStaleVisits, STALE_VISIT_BATCH_SIZE, STALE_VISIT_NOTE } from '../src/modules/daily-teams/stale-visits';

type Visit = {
  id: string;
  dailyTeamId: string;
  workDate: Date;
  ticketId: string;
  outcome: DailyTicketOutcome;
  outcomeNote: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
};
type Ticket = { id: string; status: TicketStatus; pendingNote: string | null };
type Event = { ticketId: string; type: string; data: { note: string; dates: string[] } };

const today = new Date('2026-03-10T00:00:00.000Z');
const yesterday = new Date('2026-03-09T00:00:00.000Z');

function fakeStore(visits: Visit[], tickets: Ticket[]) {
  const events: Event[] = [];
  const dateMatch = (value: Date, range?: { lt?: Date; gte?: Date }) =>
    (!range?.lt || value < range.lt) && (!range?.gte || value >= range.gte);
  const idMatch = (where: { id?: string | { in: string[] } }, id: string) =>
    typeof where.id === 'string' ? where.id === id : !where.id || where.id.in.includes(id);
  const matches = (visit: Visit, where: Record<string, any>) =>
    idMatch(where, visit.id) &&
    (!where.ticketId || where.ticketId === visit.ticketId || where.ticketId.in?.includes(visit.ticketId)) &&
    (!where.outcome || visit.outcome === where.outcome) &&
    dateMatch(visit.workDate, where.workDate);
  const store = {
    $queryRaw: async () => [],
    dailyTeamTicket: {
      findMany: async ({ where, orderBy, take }: { where: Record<string, any>; orderBy?: { workDate: string }; take?: number }) => {
        const found = visits.filter((visit) => matches(visit, where));
        const ordered = orderBy?.workDate === 'asc' ? found.sort((a, b) => a.workDate.getTime() - b.workDate.getTime()) : found;
        return take ? ordered.slice(0, take) : ordered;
      },
      updateMany: async ({ where, data }: { where: Record<string, any>; data: Partial<Visit> }) => {
        let count = 0;
        for (const visit of visits) {
          if (!matches(visit, where)) continue;
          Object.assign(visit, data);
          count += 1;
        }
        return { count };
      },
      count: async ({ where }: { where: Record<string, any> }) => visits.filter((visit) =>
        matches(visit, where) &&
        (!where.OR || where.OR.some((clause: Record<string, any>) =>
          ('startedAt' in clause ? (clause.startedAt.not === null ? visit.startedAt !== null : visit.startedAt === null) : true) &&
          ('outcome' in clause ? visit.outcome !== clause.outcome.not : true),
        )),
      ).length,
    },
    ticket: {
      updateMany: async ({ where, data }: { where: Record<string, any>; data: Partial<Ticket> }) => {
        let count = 0;
        for (const ticket of tickets) {
          const statusMatch = where.status?.not ? ticket.status !== where.status.not : !where.status || ticket.status === where.status;
          if (!idMatch(where, ticket.id) || !statusMatch) continue;
          Object.assign(ticket, data);
          count += 1;
        }
        return { count };
      },
    },
    ticketEvent: {
      create: async ({ data }: { data: Event }) => events.push(data),
    },
  };
  return { store: store as unknown as Parameters<typeof closeStaleVisits>[0], events };
}

function visit(overrides: Partial<Visit> = {}): Visit {
  return {
    id: 'visit-1',
    dailyTeamId: 'team-yesterday',
    workDate: yesterday,
    ticketId: 'ticket-1',
    outcome: DailyTicketOutcome.PENDING,
    outcomeNote: null,
    startedAt: new Date('2026-03-09T14:00:00.000Z'),
    completedAt: null,
    ...overrides,
  };
}

describe('cierre automático de visitas vencidas', () => {
  it('cierra como NOT_DONE conservando equipo, fecha y startedAt, libera el ticket y audita el cierre', async () => {
    const stale = visit();
    const ticket: Ticket = { id: 'ticket-1', status: TicketStatus.IN_PROGRESS, pendingNote: null };
    const { store, events } = fakeStore([stale], [ticket]);
    const now = new Date('2026-03-10T08:00:00.000Z');

    expect(await closeStaleVisits(store, today, now)).toBe(1);

    expect(stale.outcome).toBe(DailyTicketOutcome.NOT_DONE);
    expect(stale.outcomeNote).toBe(STALE_VISIT_NOTE);
    expect(stale.completedAt).toEqual(now);
    expect(stale.startedAt).toEqual(new Date('2026-03-09T14:00:00.000Z'));
    expect(stale.dailyTeamId).toBe('team-yesterday');
    expect(stale.workDate).toEqual(yesterday);
    expect(ticket.status).toBe(TicketStatus.PENDING);
    expect(ticket.pendingNote).toBe(STALE_VISIT_NOTE);
    expect(events).toEqual([{ ticketId: 'ticket-1', type: 'DAILY_TICKET_AUTO_CLOSED', data: { note: STALE_VISIT_NOTE, dates: ['2026-03-09'] } }]);
  });

  it('es idempotente: no reescribe completedAt ni duplica el evento', async () => {
    const stale = visit();
    const ticket: Ticket = { id: 'ticket-1', status: TicketStatus.IN_PROGRESS, pendingNote: null };
    const { store, events } = fakeStore([stale], [ticket]);

    await closeStaleVisits(store, today, new Date('2026-03-10T08:00:00.000Z'));
    expect(await closeStaleVisits(store, today, new Date('2026-03-10T09:00:00.000Z'))).toBe(0);

    expect(stale.completedAt).toEqual(new Date('2026-03-10T08:00:00.000Z'));
    expect(events).toHaveLength(1);
  });

  it('no toca pendientes de hoy ni visitas ya finalizadas', async () => {
    const todayVisit = visit({ id: 'today', workDate: today, ticketId: 'ticket-2' });
    const doneVisit = visit({ id: 'done', outcome: DailyTicketOutcome.DONE, completedAt: yesterday, ticketId: 'ticket-3' });
    const ticket: Ticket = { id: 'ticket-2', status: TicketStatus.PENDING, pendingNote: 'Pendiente actual' };
    const resolved: Ticket = { id: 'ticket-3', status: TicketStatus.RESOLVED, pendingNote: null };
    const { store, events } = fakeStore([todayVisit, doneVisit], [ticket, resolved]);

    expect(await closeStaleVisits(store, today)).toBe(0);
    expect(todayVisit.outcome).toBe(DailyTicketOutcome.PENDING);
    expect(todayVisit.completedAt).toBeNull();
    expect(doneVisit.outcome).toBe(DailyTicketOutcome.DONE);
    expect(resolved.status).toBe(TicketStatus.RESOLVED);
    expect(events).toHaveLength(0);
  });

  it('no libera el ticket si la cuadrilla actual ya lo inició', async () => {
    const stale = visit();
    const current = visit({ id: 'current', workDate: today });
    const ticket: Ticket = { id: 'ticket-1', status: TicketStatus.IN_PROGRESS, pendingNote: 'Pendiente actual' };
    const { store, events } = fakeStore([stale, current], [ticket]);

    expect(await closeStaleVisits(store, today)).toBe(1);
    expect(stale.outcome).toBe(DailyTicketOutcome.NOT_DONE);
    expect(current.outcome).toBe(DailyTicketOutcome.PENDING);
    expect(ticket.status).toBe(TicketStatus.IN_PROGRESS);
    expect(ticket.pendingNote).toBe('Pendiente actual');
    expect(events).toHaveLength(1);
  });

  it('libera el ticket si la nueva cuadrilla aún no inició la visita', async () => {
    const stale = visit();
    const current = visit({ id: 'current', workDate: today, startedAt: null });
    const ticket: Ticket = { id: 'ticket-1', status: TicketStatus.IN_PROGRESS, pendingNote: null };
    const { store } = fakeStore([stale, current], [ticket]);

    expect(await closeStaleVisits(store, today)).toBe(1);
    expect(current.outcome).toBe(DailyTicketOutcome.PENDING);
    expect(ticket.status).toBe(TicketStatus.PENDING);
    expect(ticket.pendingNote).toBe(STALE_VISIT_NOTE);
  });

  it('no sobrescribe motivo ni nota de un ticket que ya no está iniciado', async () => {
    const stale = visit();
    const ticket: Ticket = { id: 'ticket-1', status: TicketStatus.PENDING, pendingNote: 'Nota registrada por otro cambio' };
    const { store, events } = fakeStore([stale], [ticket]);

    await closeStaleVisits(store, today);

    expect(stale.outcome).toBe(DailyTicketOutcome.NOT_DONE);
    expect(ticket.pendingNote).toBe('Nota registrada por otro cambio');
    expect(events).toHaveLength(1);
  });

  it('agrupa el evento por ticket cerrado', async () => {
    const first = visit({ id: 'a1', ticketId: 'ticket-a' });
    const second = visit({ id: 'a2', ticketId: 'ticket-a', workDate: new Date('2026-03-08T00:00:00.000Z') });
    const other = visit({ id: 'b1', ticketId: 'ticket-b' });
    const { store, events } = fakeStore([first, second, other], []);

    expect(await closeStaleVisits(store, today)).toBe(3);
    expect(events.map((event) => event.ticketId).sort()).toEqual(['ticket-a', 'ticket-b']);
    expect(events.find((event) => event.ticketId === 'ticket-a')?.data.dates).toEqual(['2026-03-08', '2026-03-09']);
  });

  it('drena un backlog en lotes acotados', async () => {
    const staleVisits = Array.from({ length: STALE_VISIT_BATCH_SIZE + 1 }, (_, index) => visit({
      id: `visit-${index}`,
      ticketId: `ticket-${index}`,
    }));
    const { store, events } = fakeStore(staleVisits, []);

    expect(await closeStaleVisits(store, today)).toBe(STALE_VISIT_BATCH_SIZE);
    expect(staleVisits.filter((item) => item.outcome === DailyTicketOutcome.PENDING)).toHaveLength(1);
    expect(await closeStaleVisits(store, today)).toBe(1);
    expect(events).toHaveLength(STALE_VISIT_BATCH_SIZE + 1);
  });

  it('no libera el ticket hasta cerrar todos sus lotes históricos', async () => {
    const staleVisits = Array.from({ length: STALE_VISIT_BATCH_SIZE + 1 }, (_, index) => visit({ id: `visit-${index}` }));
    const ticket: Ticket = { id: 'ticket-1', status: TicketStatus.IN_PROGRESS, pendingNote: null };
    const { store } = fakeStore(staleVisits, [ticket]);

    expect(await closeStaleVisits(store, today)).toBe(STALE_VISIT_BATCH_SIZE);
    expect(ticket.status).toBe(TicketStatus.IN_PROGRESS);
    expect(await closeStaleVisits(store, today)).toBe(1);
    expect(ticket.status).toBe(TicketStatus.PENDING);
    expect(ticket.pendingNote).toBe(STALE_VISIT_NOTE);
  });
});
