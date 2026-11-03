import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DailyTicketOutcome, Prisma, Role, TicketStatus } from '@prisma/client';
import { Principal } from '../../common/principal';
import { PrismaService } from '../../infrastructure/prisma.service';
import { AssignDailyTicketsDto, CreateDailyTeamDto, UpdateDailyTeamDto, UpdateDailyTicketOutcomeDto } from './daily-teams.dto';
import { buildParticipantSnapshot, canTechnicianOperate, missingNotDoneContext } from './daily-execution';
import { currentPlanningWorkDate, planningDate } from './planning-date';

const ticketBaseInclude = { customer: true, category: true, assignedTo: { select: { id: true, name: true } }, pendingReason: true } as const;
const completionInclude = { select: { id: true, name: true } } as const;
const previousAttemptInclude = Prisma.validator<Prisma.DailyTeamTicketInclude>()({
  dailyTeam: { select: { id: true, name: true } },
  pendingReason: { select: { id: true, name: true } },
  completedBy: completionInclude,
  participants: { orderBy: { createdAt: 'asc' } },
});
const resultInclude = Prisma.validator<Prisma.DailyTeamTicketInclude>()({
  participants: { orderBy: { createdAt: 'asc' } },
  completedBy: completionInclude,
  pendingReason: { select: { id: true, name: true } },
});
const ticketInclude = (workDate: Date) => Prisma.validator<Prisma.TicketInclude>()({
  ...ticketBaseInclude,
  dailyTeamAssignments: {
    where: { workDate: { lt: workDate } },
    orderBy: { workDate: 'desc' },
    take: 1,
    include: previousAttemptInclude,
  },
});

@Injectable()
export class DailyTeamsService {
  constructor(private prisma: PrismaService) {}

  async planning(dateText: string, principal: Principal) {
    const workDate = planningDate(dateText);
    const memberScope = principal.role === Role.TECHNICIAN ? { members: { some: { technicianId: principal.id } } } : {};
    const [teams, pendingReasons] = await Promise.all([
      this.prisma.dailyTeam.findMany({
        where: { workDate, ...memberScope },
        include: {
          members: { include: { technician: { select: { id: true, name: true, zone: true, active: true } } }, orderBy: { technician: { name: 'asc' } } },
          tickets: { include: { ticket: { include: ticketInclude(workDate) }, ...resultInclude }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.pendingReason.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    ]);
    if (principal.role === Role.TECHNICIAN) return { date: dateText, today: currentPlanningWorkDate().toISOString().slice(0, 10), teams, technicians: [], unplannedTickets: [], pendingReasons };
    const [technicians, unplannedTickets] = await Promise.all([
      this.prisma.user.findMany({ where: { role: Role.TECHNICIAN, active: true }, select: { id: true, name: true, zone: true, active: true }, orderBy: { name: 'asc' } }),
      this.prisma.ticket.findMany({
        where: { status: { not: TicketStatus.RESOLVED }, dailyTeamAssignments: { none: { workDate } } },
        include: ticketInclude(workDate),
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
        take: 300,
      }),
    ]);
    return { date: dateText, today: currentPlanningWorkDate().toISOString().slice(0, 10), teams, technicians, unplannedTickets, pendingReasons };
  }

  async create(dto: CreateDailyTeamDto, principal: Principal) {
    this.assertHumanManager(principal);
    const workDate = planningDate(dto.date);
    await this.assertTechnicians(dto.technicianIds);
    try {
      return await this.prisma.dailyTeam.create({
        data: { name: dto.name.trim(), workDate, createdById: principal.id, members: { create: dto.technicianIds.map((technicianId) => ({ technicianId })) } },
      });
    } catch (error) { this.handleConflict(error); }
  }

  async update(id: string, dto: UpdateDailyTeamDto, principal: Principal) {
    this.assertHumanManager(principal);
    await this.team(id);
    await this.assertTechnicians(dto.technicianIds);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.dailyTeamMember.deleteMany({ where: { dailyTeamId: id } });
        return tx.dailyTeam.update({ where: { id }, data: { name: dto.name.trim(), members: { create: dto.technicianIds.map((technicianId) => ({ technicianId })) } } });
      });
    } catch (error) { this.handleConflict(error); }
  }

  async assign(id: string, dto: AssignDailyTicketsDto, principal: Principal) {
    this.assertHumanManager(principal);
    const team = await this.team(id);
    return this.prisma.$transaction(async (tx) => {
      await this.lockTickets(tx, dto.ticketIds);
      const tickets = await tx.ticket.findMany({ where: { id: { in: dto.ticketIds } }, select: { id: true, status: true } });
      if (tickets.length !== dto.ticketIds.length) throw new NotFoundException('Uno o más tickets no existen.');
      if (tickets.some((ticket) => ticket.status === TicketStatus.RESOLVED)) throw new BadRequestException('No se pueden planificar tickets resueltos.');
      const existing = await tx.dailyTeamTicket.findMany({
        where: { ticketId: { in: dto.ticketIds }, workDate: team.workDate },
        select: { id: true, outcome: true, startedAt: true },
      });
      if (existing.some((assignment) => assignment.outcome !== DailyTicketOutcome.PENDING || assignment.startedAt)) {
        throw new ConflictException('Una visita iniciada o finalizada conserva su historial y no puede reasignarse ese día.');
      }
      if (existing.length) await tx.dailyTeamTicket.deleteMany({ where: { id: { in: existing.map((assignment) => assignment.id) } } });
      await tx.dailyTeamTicket.createMany({ data: dto.ticketIds.map((ticketId) => ({ dailyTeamId: id, workDate: team.workDate, ticketId, assignedById: principal.id })) });
      await tx.ticketEvent.createMany({ data: dto.ticketIds.map((ticketId) => ({ ticketId, type: 'DAILY_TEAM_ASSIGNED', actorId: principal.id, data: { teamId: id, teamName: team.name, date: team.workDate.toISOString().slice(0, 10) } })) });
      return { assigned: dto.ticketIds.length };
    });
  }

  async start(teamId: string, ticketId: string, principal: Principal) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await this.lockTicket(tx, ticketId);
      const assignment = await this.assignment(tx, teamId, ticketId);
      this.assertOperationalAccess(principal, assignment);
      await this.assertNoLaterAssignment(tx, assignment);
      if (assignment.outcome !== DailyTicketOutcome.PENDING) throw new ConflictException('La visita ya fue finalizada.');
      if (assignment.ticket.status === TicketStatus.RESOLVED) throw new BadRequestException('El ticket ya está realizado.');
      await this.snapshotParticipants(tx, assignment.id, assignment.dailyTeam.members);
      const result = await tx.dailyTeamTicket.updateMany({
        where: { id: assignment.id, outcome: DailyTicketOutcome.PENDING },
        data: { startedAt: assignment.startedAt ?? now },
      });
      if (!result.count) throw new ConflictException('La visita ya fue finalizada por otro usuario.');
      if (assignment.ticket.status !== TicketStatus.IN_PROGRESS) {
        await tx.ticket.update({ where: { id: ticketId }, data: { status: TicketStatus.IN_PROGRESS } });
      }
      await tx.ticketEvent.create({ data: { ticketId, type: 'DAILY_TICKET_STARTED', actorId: principal.id, data: { teamId, date: assignment.workDate.toISOString().slice(0, 10) } } });
      return tx.dailyTeamTicket.findUniqueOrThrow({ where: { id: assignment.id }, include: resultInclude });
    });
  }

  async updateOutcome(teamId: string, ticketId: string, dto: UpdateDailyTicketOutcomeDto, principal: Principal) {
    const note = dto.note?.trim() || null;
    if (missingNotDoneContext(dto.outcome, note, dto.pendingReasonId)) {
      throw new BadRequestException('Indique un motivo o una nota cuando la visita no se realizó.');
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await this.lockTicket(tx, ticketId);
      const assignment = await this.assignment(tx, teamId, ticketId);
      this.assertOperationalAccess(principal, assignment);
      await this.assertNoLaterAssignment(tx, assignment);
      if (assignment.outcome !== DailyTicketOutcome.PENDING) throw new ConflictException('La visita ya fue finalizada por otro usuario.');
      if (dto.pendingReasonId) {
        const reason = await tx.pendingReason.findFirst({ where: { id: dto.pendingReasonId, active: true } });
        if (!reason) throw new BadRequestException('Motivo pendiente inválido.');
      }
      const deferredTo = dto.outcome === DailyTicketOutcome.NOT_DONE && dto.deferredTo ? planningDate(dto.deferredTo) : null;
      if (deferredTo && deferredTo.getTime() <= assignment.workDate.getTime()) {
        throw new BadRequestException('La nueva fecha debe ser posterior a la fecha de la visita.');
      }
      const deferredSchedule = deferredTo ? new Date(`${dto.deferredTo}T12:00:00.000Z`) : null;
      const pendingReasonId = dto.outcome === DailyTicketOutcome.NOT_DONE ? dto.pendingReasonId ?? null : null;
      await this.snapshotParticipants(tx, assignment.id, assignment.dailyTeam.members);
      const result = await tx.dailyTeamTicket.updateMany({
        where: { id: assignment.id, outcome: DailyTicketOutcome.PENDING },
        data: {
          outcome: dto.outcome,
          outcomeNote: note,
          pendingReasonId,
          deferredTo,
          completedAt: now,
          completedById: principal.id,
        },
      });
      if (!result.count) throw new ConflictException('La visita ya fue finalizada por otro usuario.');
      if (dto.outcome === DailyTicketOutcome.DONE) {
        await tx.ticket.update({
          where: { id: ticketId },
          data: { status: TicketStatus.RESOLVED, resolvedAt: now, pendingReasonId: null, pendingNote: null },
        });
      } else {
        await tx.ticket.update({
          where: { id: ticketId },
          data: {
            status: TicketStatus.PENDING,
            resolvedAt: null,
            pendingReasonId,
            pendingNote: note,
            ...(deferredSchedule ? { scheduledAt: deferredSchedule } : {}),
          },
        });
      }
      await tx.ticketEvent.create({
        data: {
          ticketId,
          type: dto.outcome === DailyTicketOutcome.DONE ? 'DAILY_TICKET_DONE' : 'DAILY_TICKET_NOT_DONE',
          actorId: principal.id,
          data: {
            teamId,
            date: assignment.workDate.toISOString().slice(0, 10),
            note,
            pendingReasonId,
            deferredTo: deferredTo?.toISOString().slice(0, 10) ?? null,
          },
        },
      });
      return tx.dailyTeamTicket.findUniqueOrThrow({ where: { id: assignment.id }, include: resultInclude });
    });
  }

  async unassign(id: string, ticketId: string, principal: Principal) {
    this.assertHumanManager(principal);
    const assignment = await this.prisma.dailyTeamTicket.findUnique({ where: { dailyTeamId_ticketId: { dailyTeamId: id, ticketId } }, include: { dailyTeam: true } });
    if (!assignment) throw new NotFoundException('Asignación no encontrada.');
    if (assignment.outcome !== DailyTicketOutcome.PENDING || assignment.startedAt) throw new ConflictException('Una visita iniciada o finalizada conserva su historial y no puede retirarse.');
    await this.prisma.$transaction([
      this.prisma.dailyTeamTicket.delete({ where: { id: assignment.id } }),
      this.prisma.ticketEvent.create({ data: { ticketId, type: 'DAILY_TEAM_UNASSIGNED', actorId: principal.id, data: { teamId: id, teamName: assignment.dailyTeam.name, date: assignment.workDate.toISOString().slice(0, 10) } } }),
    ]);
    return { removed: true };
  }

  async remove(id: string, principal: Principal) {
    this.assertHumanManager(principal);
    const team = await this.team(id);
    if (await this.prisma.dailyTeamTicket.count({ where: { dailyTeamId: id } })) throw new ConflictException('Retire los tickets antes de eliminar la cuadrilla.');
    await this.prisma.dailyTeam.delete({ where: { id: team.id } });
    return { removed: true };
  }

  private async assignment(tx: Prisma.TransactionClient, teamId: string, ticketId: string) {
    const assignment = await tx.dailyTeamTicket.findUnique({
      where: { dailyTeamId_ticketId: { dailyTeamId: teamId, ticketId } },
      include: {
        dailyTeam: { include: { members: { include: { technician: { select: { id: true, name: true, role: true } } } } } },
        ticket: { select: { id: true, status: true } },
      },
    });
    if (!assignment) throw new NotFoundException('Asignación no encontrada.');
    return assignment;
  }
  private async lockTicket(tx: Prisma.TransactionClient, ticketId: string) {
    await tx.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" = ${ticketId}::uuid FOR UPDATE`;
  }
  private async lockTickets(tx: Prisma.TransactionClient, ticketIds: string[]) {
    if (!ticketIds.length) return;
    await tx.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" = ANY(${ticketIds}::uuid[]) ORDER BY "id" FOR UPDATE`;
  }
  private async assertNoLaterAssignment(tx: Prisma.TransactionClient, assignment: { ticketId: string; workDate: Date }) {
    const later = await tx.dailyTeamTicket.count({ where: { ticketId: assignment.ticketId, workDate: { gt: assignment.workDate } } });
    if (later) throw new ConflictException('Existe una planificación posterior para este ticket; gestione primero esa fecha.');
  }
  private async snapshotParticipants(tx: Prisma.TransactionClient, assignmentId: string, members: { technician: { id: string; name: string; role: Role } }[]) {
    if (await tx.dailyTeamTicketParticipant.count({ where: { dailyTeamTicketId: assignmentId } })) return;
    const participants = buildParticipantSnapshot(members);
    if (!participants.length) return;
    await tx.dailyTeamTicketParticipant.createMany({ data: participants.map((participant) => ({ ...participant, dailyTeamTicketId: assignmentId })), skipDuplicates: true });
  }
  private async team(id: string) {
    const team = await this.prisma.dailyTeam.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('Cuadrilla no encontrada.');
    return team;
  }
  private async assertTechnicians(ids: string[]) {
    if (!ids.length) return;
    const count = await this.prisma.user.count({ where: { id: { in: ids }, role: Role.TECHNICIAN, active: true } });
    if (count !== ids.length) throw new BadRequestException('Uno o más técnicos son inválidos o están inactivos.');
  }
  private assertOperationalAccess(principal: Principal, assignment: { workDate: Date; dailyTeam: { members: { technicianId: string }[] } }) {
    if (assignment.workDate.getTime() !== currentPlanningWorkDate().getTime()) {
      throw new ForbiddenException('Solo se puede registrar la ejecución de la fecha actual.');
    }
    if (principal.kind !== 'user') throw new ForbiddenException('Solo usuarios pueden registrar la ejecución diaria.');
    if (principal.role === Role.ADMIN || principal.role === Role.TEAM_LEADER) return;
    if (principal.role !== Role.TECHNICIAN) throw new ForbiddenException('Permiso insuficiente.');
    const isMember = assignment.dailyTeam.members.some((member) => member.technicianId === principal.id);
    if (!canTechnicianOperate(assignment.workDate, currentPlanningWorkDate(), isMember)) {
      throw new ForbiddenException('Solo puede registrar visitas de su cuadrilla para el día de hoy.');
    }
  }
  private assertHumanManager(principal: Principal) {
    if (principal.kind !== 'user' || (principal.role !== Role.ADMIN && principal.role !== Role.TEAM_LEADER)) throw new ForbiddenException('Solo administradores y líderes pueden organizar cuadrillas.');
  }
  private handleConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('El nombre o uno de los técnicos ya está ocupado en otra cuadrilla ese día.');
    throw error;
  }
}
