import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, TicketStatus } from '@prisma/client';
import { Principal } from '../../common/principal';
import { PrismaService } from '../../infrastructure/prisma.service';
import { AssignDailyTicketsDto, CreateDailyTeamDto, UpdateDailyTeamDto } from './daily-teams.dto';
import { planningDate } from './planning-date';

const ticketInclude = { customer: true, category: true, assignedTo: { select: { id: true, name: true } }, pendingReason: true } as const;

@Injectable()
export class DailyTeamsService {
  constructor(private prisma: PrismaService) {}

  async planning(dateText: string, principal: Principal) {
    const workDate = planningDate(dateText);
    const memberScope = principal.role === Role.TECHNICIAN ? { members: { some: { technicianId: principal.id } } } : {};
    const teams = await this.prisma.dailyTeam.findMany({
      where: { workDate, ...memberScope },
      include: {
        members: { include: { technician: { select: { id: true, name: true, zone: true, active: true } } }, orderBy: { technician: { name: 'asc' } } },
        tickets: { include: { ticket: { include: ticketInclude } }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
    if (principal.role === Role.TECHNICIAN) return { date: dateText, teams, technicians: [], unplannedTickets: [] };
    const [technicians, unplannedTickets] = await Promise.all([
      this.prisma.user.findMany({ where: { role: Role.TECHNICIAN, active: true }, select: { id: true, name: true, zone: true, active: true }, orderBy: { name: 'asc' } }),
      this.prisma.ticket.findMany({
        where: { status: { not: TicketStatus.RESOLVED }, dailyTeamAssignments: { none: { workDate } } },
        include: ticketInclude,
        orderBy: [{ createdAt: 'desc' }],
        take: 300,
      }),
    ]);
    return { date: dateText, teams, technicians, unplannedTickets };
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
    const tickets = await this.prisma.ticket.findMany({ where: { id: { in: dto.ticketIds } }, select: { id: true, status: true } });
    if (tickets.length !== dto.ticketIds.length) throw new NotFoundException('Uno o más tickets no existen.');
    if (tickets.some((ticket) => ticket.status === TicketStatus.RESOLVED)) throw new BadRequestException('No se pueden planificar tickets resueltos.');
    await this.prisma.$transaction(async (tx) => {
      await tx.dailyTeamTicket.deleteMany({ where: { ticketId: { in: dto.ticketIds }, workDate: team.workDate } });
      await tx.dailyTeamTicket.createMany({ data: dto.ticketIds.map((ticketId) => ({ dailyTeamId: id, workDate: team.workDate, ticketId, assignedById: principal.id })) });
      await tx.ticketEvent.createMany({ data: dto.ticketIds.map((ticketId) => ({ ticketId, type: 'DAILY_TEAM_ASSIGNED', actorId: principal.id, data: { teamId: id, teamName: team.name, date: team.workDate.toISOString().slice(0, 10) } })) });
    });
    return { assigned: dto.ticketIds.length };
  }

  async unassign(id: string, ticketId: string, principal: Principal) {
    this.assertHumanManager(principal);
    const assignment = await this.prisma.dailyTeamTicket.findUnique({ where: { dailyTeamId_ticketId: { dailyTeamId: id, ticketId } }, include: { dailyTeam: true } });
    if (!assignment) throw new NotFoundException('Asignación no encontrada.');
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
  private assertHumanManager(principal: Principal) {
    if (principal.kind !== 'user' || (principal.role !== Role.ADMIN && principal.role !== Role.TEAM_LEADER)) throw new ForbiddenException('Solo administradores y líderes pueden organizar cuadrillas.');
  }
  private handleConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('El nombre o uno de los técnicos ya está ocupado en otra cuadrilla ese día.');
    throw error;
  }
}
