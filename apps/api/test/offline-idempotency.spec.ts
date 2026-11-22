import { randomUUID } from 'crypto';
import { DailyTicketOutcome, PrismaClient, Role, TicketStatus } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '../src/common/principal';
import type { PrismaService } from '../src/infrastructure/prisma.service';
import { DailyTeamsService } from '../src/modules/daily-teams/daily-teams.service';
import { currentPlanningWorkDate } from '../src/modules/daily-teams/planning-date';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('offline daily execution idempotency', () => {
  let prisma: PrismaClient;
  let service: DailyTeamsService;
  let admin: Principal;
  let customerId: string;
  let categoryId: string;
  let reasonId: string;
  let todayTeamId: string;
  let yesterdayTeamId: string;
  const ticketIds: string[] = [];
  const teamIds: string[] = [];
  const operationIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const today = currentPlanningWorkDate();
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  async function createTicket() {
    const ticket = await prisma.ticket.create({
      data: { title: `Offline ${suffix}`, customerId, categoryId, status: TicketStatus.PENDING },
    });
    ticketIds.push(ticket.id);
    return ticket;
  }

  async function createTeam(workDate: Date, name: string) {
    const team = await prisma.dailyTeam.create({
      data: { name: `${name} ${suffix}`, workDate, createdById: admin.id },
    });
    teamIds.push(team.id);
    return team;
  }

  function operation() {
    const id = randomUUID();
    operationIds.push(id);
    return id;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    service = new DailyTeamsService(prisma as unknown as PrismaService);
    const user = await prisma.user.create({
      data: { name: `Offline Admin ${suffix}`, email: `offline-${suffix}@test.local`, passwordHash: 'test', role: Role.ADMIN },
    });
    admin = { id: user.id, name: user.name, role: user.role, kind: 'user' };
    const customer = await prisma.customer.create({ data: { name: `Offline Customer ${suffix}` } });
    const category = await prisma.ticketCategory.create({ data: { code: `offline-${suffix}`, name: `Offline ${suffix}`, fields: [] } });
    const reason = await prisma.pendingReason.create({ data: { name: `Motivo offline ${suffix}` } });
    customerId = customer.id;
    categoryId = category.id;
    reasonId = reason.id;
    todayTeamId = (await createTeam(today, 'Today')).id;
    yesterdayTeamId = (await createTeam(yesterday, 'Yesterday')).id;
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.offlineOperation.deleteMany({ where: { id: { in: operationIds } } });
    await prisma.ticketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.dailyTeamTicket.deleteMany({ where: { OR: [{ ticketId: { in: ticketIds } }, { dailyTeamId: { in: teamIds } }] } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.dailyTeam.deleteMany({ where: { id: { in: teamIds } } });
    if (customerId) await prisma.customer.delete({ where: { id: customerId } }).catch(() => undefined);
    if (categoryId) await prisma.ticketCategory.delete({ where: { id: categoryId } }).catch(() => undefined);
    if (reasonId) await prisma.pendingReason.delete({ where: { id: reasonId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: admin.id } });
    await prisma.$disconnect();
  });

  it('replays a start operation without duplicating events', async () => {
    const ticket = await createTicket();
    await service.assign(todayTeamId, { ticketIds: [ticket.id] }, admin);
    const clientOperationId = operation();
    const executedAt = new Date().toISOString();
    const first = await service.start(todayTeamId, ticket.id, admin, { clientOperationId, executedAt });
    const second = await service.start(todayTeamId, ticket.id, admin, { clientOperationId, executedAt });
    expect(second.id).toBe(first.id);
    expect(await prisma.ticketEvent.count({ where: { ticketId: ticket.id, type: 'DAILY_TICKET_STARTED' } })).toBe(1);
  }, 30_000);

  it('replays an outcome operation and preserves the executedAt timestamp', async () => {
    const ticket = await createTicket();
    await service.assign(todayTeamId, { ticketIds: [ticket.id] }, admin);
    const clientOperationId = operation();
    const executedAt = new Date(Date.now() - 60_000).toISOString();
    const first = await service.updateOutcome(todayTeamId, ticket.id, { outcome: 'DONE', note: 'Visita realizada', clientOperationId, executedAt }, admin);
    const second = await service.updateOutcome(todayTeamId, ticket.id, { outcome: 'DONE', note: 'Visita realizada', clientOperationId, executedAt }, admin);
    expect(second.id).toBe(first.id);
    expect(second.completedAt?.toISOString()).toBe(new Date(executedAt).toISOString());
    expect(await prisma.ticketEvent.count({ where: { ticketId: ticket.id, type: 'DAILY_TICKET_DONE' } })).toBe(1);
  }, 30_000);

  it('rejects NOT_DONE without a structured reason and accepts it without a note', async () => {
    const ticket = await createTicket();
    await service.assign(todayTeamId, { ticketIds: [ticket.id] }, admin);
    await expect(service.updateOutcome(todayTeamId, ticket.id, { outcome: 'NOT_DONE', note: 'Cliente ausente' }, admin)).rejects.toThrow('motivo');
    const result = await service.updateOutcome(todayTeamId, ticket.id, { outcome: 'NOT_DONE', pendingReasonId: reasonId }, admin);
    expect(result.outcome).toBe(DailyTicketOutcome.NOT_DONE);
    expect(result.outcomeNote).toBeNull();
    expect(result.pendingReason?.id).toBe(reasonId);
  }, 30_000);

  it('accepts a reasonable late sync for the visit day', async () => {
    const ticket = await createTicket();
    await service.assign(yesterdayTeamId, { ticketIds: [ticket.id] }, admin);
    const executedAt = new Date(`${yesterday.toISOString().slice(0, 10)}T12:00:00.000Z`).toISOString();
    const result = await service.updateOutcome(yesterdayTeamId, ticket.id, { outcome: 'DONE', note: 'Sincronización tardía', clientOperationId: operation(), executedAt }, admin);
    expect(result.outcome).toBe(DailyTicketOutcome.DONE);
    expect(result.completedAt?.toISOString()).toBe(executedAt);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe(TicketStatus.RESOLVED);
  }, 30_000);

  it('rejects reusing an operation id for another ticket', async () => {
    const first = await createTicket();
    const second = await createTicket();
    await service.assign(todayTeamId, { ticketIds: [first.id, second.id] }, admin);
    const clientOperationId = operation();
    await service.updateOutcome(todayTeamId, first.id, { outcome: 'DONE', note: 'Visita realizada', clientOperationId }, admin);
    await expect(service.updateOutcome(todayTeamId, second.id, { outcome: 'DONE', note: 'Visita realizada', clientOperationId }, admin)).rejects.toThrow('ya utilizado');
  }, 30_000);
});
