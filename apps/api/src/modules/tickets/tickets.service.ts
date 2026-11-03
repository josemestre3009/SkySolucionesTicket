import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, TicketStatus } from '@prisma/client';
import { Principal } from '../../common/principal';
import { PrismaService } from '../../infrastructure/prisma.service';
import { currentPlanningWorkDate } from '../daily-teams/planning-date';
import { canTransition } from './domain/ticket-workflow';
import { AddNoteDto, AssignTicketDto, ChangeStatusDto, CreateTicketDto, UpdateTicketDto } from './tickets.dto';

const include = { customer: true, category: true, assignedTo: { select: { id: true, name: true } }, pendingReason: true } as const;
const executionHistoryInclude = Prisma.validator<Prisma.TicketInclude>()({
  dailyTeamAssignments: {
    orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
    include: {
      dailyTeam: { select: { id: true, name: true } },
      participants: { orderBy: { createdAt: 'asc' } },
      completedBy: { select: { id: true, name: true } },
      pendingReason: { select: { id: true, name: true } },
    },
  },
});
const actorData = (p: Principal) => p.kind === 'user' ? { actorId: p.id } : { apiClientId: p.id };

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) {}
  async list(p: Principal, status?: TicketStatus, q?: string) {
    const filters: Prisma.TicketWhereInput[] = [];
    if (p.role === Role.TECHNICIAN) filters.push(this.technicianScope(p));
    if (status) filters.push({ status });
    if (q) filters.push({ OR: [{ title: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }] });
    return this.prisma.ticket.findMany({ where: filters.length ? { AND: filters } : {}, include, orderBy: [{ status: 'asc' }, { scheduledAt: 'asc' }, { createdAt: 'desc' }], take: 100 });
  }
  async get(id: string, p: Principal) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id }, include: { ...include, ...executionHistoryInclude, notes: { include: { author: { select: { name: true } }, apiClient: { select: { name: true } } }, orderBy: { createdAt: 'asc' } }, events: { include: { actor: { select: { name: true } }, apiClient: { select: { name: true } } }, orderBy: { createdAt: 'asc' } } } });
    if (!ticket) throw new NotFoundException('Ticket no encontrado.');
    if (p.role === Role.TECHNICIAN && ticket.assignedToId !== p.id) {
      const teamAccess = await this.prisma.dailyTeamTicket.count({ where: { ticketId: id, workDate: currentPlanningWorkDate(), dailyTeam: { members: { some: { technicianId: p.id } } } } });
      if (!teamAccess) throw new ForbiddenException('El ticket no está asignado a este técnico.');
    }
    return ticket;
  }
  async create(dto: CreateTicketDto, p: Principal) {
    if (p.role === Role.TECHNICIAN) throw new ForbiddenException('Los técnicos no crean tickets.');
    if (dto.assignedToId) await this.assertTechnician(dto.assignedToId);
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.create({ data: { ...dto, scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined, customFields: dto.customFields as Prisma.InputJsonValue ?? {}, status: TicketStatus.PENDING }, include });
      await tx.ticketEvent.create({ data: { ticketId: ticket.id, type: 'TICKET_CREATED', data: { status: ticket.status }, ...actorData(p) } });
      return ticket;
    });
  }
  async assign(id: string, dto: AssignTicketDto, p: Principal) {
    await this.assertTechnician(dto.technicianId);
    const ticket = await this.get(id, p);
    if (ticket.status === TicketStatus.RESOLVED) throw new BadRequestException('Un ticket resuelto no puede reasignarse.');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({ where: { id }, data: { assignedToId: dto.technicianId }, include });
      await tx.ticketEvent.create({ data: { ticketId: id, type: 'TICKET_ASSIGNED', data: { technicianId: dto.technicianId }, ...actorData(p) } });
      return updated;
    });
  }
  async update(id: string, dto: UpdateTicketDto, p: Principal) {
    const ticket = await this.get(id, p);
    if (ticket.status === TicketStatus.RESOLVED) throw new BadRequestException('Un ticket resuelto no puede editarse.');
    const { scheduledAt, customFields, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({ where: { id }, data: { ...rest, ...(scheduledAt ? { scheduledAt: new Date(scheduledAt) } : {}), ...(customFields ? { customFields: customFields as Prisma.InputJsonValue } : {}) }, include });
      await tx.ticketEvent.create({ data: { ticketId: id, type: 'TICKET_UPDATED', data: { fields: Object.keys(dto) }, ...actorData(p) } });
      return updated;
    });
  }
  async changeStatus(id: string, dto: ChangeStatusDto, p: Principal) {
    const ticket = await this.get(id, p);
    if (!canTransition(ticket.status, dto.status)) throw new BadRequestException(`Transición inválida: ${ticket.status} a ${dto.status}.`);
    if (ticket.status === TicketStatus.RESOLVED && p.role === Role.TECHNICIAN) throw new ForbiddenException('Solo administración puede reabrir un ticket realizado.');
    const data: Prisma.TicketUpdateInput = { status: dto.status, pendingReason: dto.pendingReasonId ? { connect: { id: dto.pendingReasonId } } : { disconnect: true }, pendingNote: dto.status === TicketStatus.PENDING ? dto.note ?? null : null, resolvedAt: dto.status === TicketStatus.RESOLVED ? new Date() : null };
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({ where: { id }, data, include });
      await tx.ticketEvent.create({ data: { ticketId: id, type: 'STATUS_CHANGED', data: { from: ticket.status, to: dto.status, note: dto.note }, ...actorData(p) } });
      return updated;
    });
  }
  async addNote(id: string, dto: AddNoteDto, p: Principal) {
    await this.get(id, p);
    return this.prisma.ticketNote.create({ data: { ticketId: id, body: dto.body, ...(p.kind === 'user' ? { authorId: p.id } : { apiClientId: p.id }) }, include: { author: { select: { name: true } }, apiClient: { select: { name: true } } } });
  }
  async dashboard(p: Principal) {
    const where: Prisma.TicketWhereInput = p.role === Role.TECHNICIAN ? this.technicianScope(p) : {};
    const grouped = await this.prisma.ticket.groupBy({ by: ['status'], where, _count: true });
    return Object.fromEntries(Object.values(TicketStatus).map((status) => [status, grouped.find((x) => x.status === status)?._count ?? 0]));
  }
  private technicianScope(p: Principal): Prisma.TicketWhereInput {
    return { OR: [{ assignedToId: p.id }, { dailyTeamAssignments: { some: { workDate: currentPlanningWorkDate(), dailyTeam: { members: { some: { technicianId: p.id } } } } } }] };
  }
  private async assertTechnician(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, role: Role.TECHNICIAN, active: true } });
    if (!user) throw new BadRequestException('Técnico inválido o inactivo.');
  }
}
