import { DailyTicketOutcome, PrismaClient, Role, TicketStatus } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '../src/common/principal';
import type { PrismaService } from '../src/infrastructure/prisma.service';
import { DailyTeamsService } from '../src/modules/daily-teams/daily-teams.service';
import { currentPlanningWorkDate } from '../src/modules/daily-teams/planning-date';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('daily teams execution concurrency', () => {
  let prisma: PrismaClient;
  let service: DailyTeamsService;
  let admin: Principal;
  let technician: Principal;
  let customerId: string;
  let categoryId: string;
  let todayTeamId: string;
  const ticketIds: string[] = [];
  const teamIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const today = currentPlanningWorkDate();
  const tomorrow = new Date(today);
  const yesterday = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  async function createTicket() {
    const ticket = await prisma.ticket.create({
      data: { title: `Concurrency ${suffix}`, customerId, categoryId, status: TicketStatus.PENDING },
    });
    ticketIds.push(ticket.id);
    return ticket;
  }

  async function createTeam(workDate: Date, name: string) {
    const user = await prisma.user.findFirstOrThrow({ where: { id: technician.id } });
    const team = await prisma.dailyTeam.create({
      data: {
        name: `${name} ${suffix}`,
        workDate,
        createdById: admin.id,
        members: { create: { technicianId: user.id } },
      },
    });
    teamIds.push(team.id);
    return team;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    service = new DailyTeamsService(prisma as unknown as PrismaService);
    const adminUser = await prisma.user.create({
      data: { name: `Concurrency Admin ${suffix}`, email: `admin-${suffix}@test.local`, passwordHash: 'test', role: Role.ADMIN },
    });
    const technicianUser = await prisma.user.create({
      data: { name: `Concurrency Tech ${suffix}`, email: `tech-${suffix}@test.local`, passwordHash: 'test', role: Role.TECHNICIAN },
    });
    admin = { id: adminUser.id, name: adminUser.name, role: adminUser.role, kind: 'user' };
    technician = { id: technicianUser.id, name: technicianUser.name, role: technicianUser.role, kind: 'user' };
    const customer = await prisma.customer.create({ data: { name: `Concurrency Customer ${suffix}` } });
    const category = await prisma.ticketCategory.create({ data: { code: `test-${suffix}`, name: `Test ${suffix}`, fields: [] } });
    customerId = customer.id;
    categoryId = category.id;
    const team = await createTeam(today, 'Today');
    todayTeamId = team.id;
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.ticketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.dailyTeamTicket.deleteMany({ where: { OR: [{ ticketId: { in: ticketIds } }, { dailyTeamId: { in: teamIds } }] } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.dailyTeam.deleteMany({ where: { id: { in: teamIds } } });
    if (customerId) await prisma.customer.delete({ where: { id: customerId } }).catch(() => undefined);
    if (categoryId) await prisma.ticketCategory.delete({ where: { id: categoryId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, technician.id] } } });
    await prisma.$disconnect();
  });

  it('assigns several tickets in one transaction', async () => {
    const first = await createTicket();
    const second = await createTicket();
    await service.assign(todayTeamId, { ticketIds: [first.id, second.id] }, admin);
    expect(await prisma.dailyTeamTicket.count({ where: { dailyTeamId: todayTeamId, ticketId: { in: [first.id, second.id] } } })).toBe(2);
  }, 30_000);

  it('never removes a visit that another request started during reassignment', async () => {
    for (let index = 0; index < 20; index++) {
      const ticket = await createTicket();
      await service.assign(todayTeamId, { ticketIds: [ticket.id] }, admin);
      const [, startResult] = await Promise.allSettled([
        service.assign(todayTeamId, { ticketIds: [ticket.id] }, admin),
        service.start(todayTeamId, ticket.id, technician),
      ]);
      const assignment = await prisma.dailyTeamTicket.findUnique({
        where: { dailyTeamId_ticketId: { dailyTeamId: todayTeamId, ticketId: ticket.id } },
      });
      if (startResult.status === 'fulfilled') {
        expect(assignment?.startedAt).toBeTruthy();
        expect(assignment?.outcome).toBe(DailyTicketOutcome.PENDING);
        expect(assignment?.id).toBe(startResult.value.id);
      }
      expect(assignment).not.toBeNull();
      expect(assignment?.outcome).toBe(DailyTicketOutcome.PENDING);
    }
  }, 30_000);

  it('allows only one of two concurrent outcome updates', async () => {
    for (let index = 0; index < 12; index++) {
      const ticket = await createTicket();
      await service.assign(todayTeamId, { ticketIds: [ticket.id] }, admin);
      const results = await Promise.allSettled([
        service.updateOutcome(todayTeamId, ticket.id, { outcome: 'DONE', note: 'Concurrent done' }, technician),
        service.updateOutcome(todayTeamId, ticket.id, { outcome: 'NOT_DONE', note: 'Concurrent not done' }, admin),
      ]);
      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      expect(fulfilled).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected && (rejected as PromiseRejectedResult).reason?.getStatus?.()).toBe(409);

      const assignment = await prisma.dailyTeamTicket.findUniqueOrThrow({
        where: { dailyTeamId_ticketId: { dailyTeamId: todayTeamId, ticketId: ticket.id } },
      });
      expect([DailyTicketOutcome.DONE, DailyTicketOutcome.NOT_DONE]).toContain(assignment.outcome);
      expect(assignment.completedAt).toBeTruthy();
      expect(assignment.completedById).toBeTruthy();
      const storedTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(storedTicket.status).toBe(assignment.outcome === DailyTicketOutcome.DONE ? TicketStatus.RESOLVED : TicketStatus.PENDING);
    }
  }, 30_000);

  it('rejects outcomes for past dates and when a later assignment exists', async () => {
    const previousTeam = await createTeam(yesterday, 'Past');
    const pastTicket = await createTicket();
    await service.assign(previousTeam.id, { ticketIds: [pastTicket.id] }, admin);
    await expect(service.updateOutcome(previousTeam.id, pastTicket.id, { outcome: 'DONE' }, admin)).rejects.toThrow('fecha actual');
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: pastTicket.id } })).status).toBe(TicketStatus.PENDING);

    const futureTeam = await createTeam(tomorrow, 'Future');
    const ticket = await createTicket();
    await service.assign(todayTeamId, { ticketIds: [ticket.id] }, admin);
    await service.assign(futureTeam.id, { ticketIds: [ticket.id] }, admin);
    await expect(service.updateOutcome(todayTeamId, ticket.id, { outcome: 'DONE' }, admin)).rejects.toThrow('planificación posterior');
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe(TicketStatus.PENDING);
  }, 30_000);

  it('keeps NOT_DONE reprogramming without creating a future squad assignment', async () => {
    const ticket = await createTicket();
    await service.assign(todayTeamId, { ticketIds: [ticket.id] }, admin);
    const deferredTo = tomorrow.toISOString().slice(0, 10);
    const result = await service.updateOutcome(todayTeamId, ticket.id, { outcome: 'NOT_DONE', note: 'Cliente ausente', deferredTo }, technician);
    expect(result.outcome).toBe(DailyTicketOutcome.NOT_DONE);
    expect(result.deferredTo?.toISOString().slice(0, 10)).toBe(deferredTo);
    const storedTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(storedTicket.status).toBe(TicketStatus.PENDING);
    expect(storedTicket.scheduledAt?.toISOString()).toBe(`${deferredTo}T12:00:00.000Z`);
    expect(await prisma.dailyTeamTicket.count({ where: { ticketId: ticket.id, workDate: tomorrow } })).toBe(0);
  }, 30_000);
});
