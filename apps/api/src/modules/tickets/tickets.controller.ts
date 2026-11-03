import { Body, Controller, Get, Param, ParseEnumPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role, TicketStatus } from '@prisma/client';
import { CurrentPrincipal } from '../../common/current-principal.decorator';
import { Principal } from '../../common/principal';
import { Roles } from '../../common/roles.decorator';
import { AddNoteDto, AssignTicketDto, ChangeStatusDto, CreateTicketDto, UpdateTicketDto } from './tickets.dto';
import { TicketsService } from './tickets.service';

@ApiTags('tickets') @ApiSecurity('agent-key') @Controller()
export class TicketsController {
  constructor(private service: TicketsService) {}
  @ApiQuery({ name: 'status', enum: TicketStatus, required: false }) @ApiQuery({ name: 'q', required: false })
  @Get('tickets') list(@CurrentPrincipal() p: Principal, @Query('status', new ParseEnumPipe(TicketStatus, { optional: true })) status?: TicketStatus, @Query('q') q?: string) { return this.service.list(p, status, q); }
  @Get('tickets/:id') get(@Param('id') id: string, @CurrentPrincipal() p: Principal) { return this.service.get(id, p); }
  @Roles(Role.ADMIN, Role.ASSISTANT) @Post('tickets') create(@Body() dto: CreateTicketDto, @CurrentPrincipal() p: Principal) { return this.service.create(dto, p); }
  @Roles(Role.ADMIN, Role.ASSISTANT) @Patch('tickets/:id') update(@Param('id') id: string, @Body() dto: UpdateTicketDto, @CurrentPrincipal() p: Principal) { return this.service.update(id, dto, p); }
  @Roles(Role.ADMIN, Role.ASSISTANT) @Patch('tickets/:id/assignment') assign(@Param('id') id: string, @Body() dto: AssignTicketDto, @CurrentPrincipal() p: Principal) { return this.service.assign(id, dto, p); }
  @Roles(Role.ADMIN, Role.ASSISTANT, Role.TECHNICIAN) @Patch('tickets/:id/status') status(@Param('id') id: string, @Body() dto: ChangeStatusDto, @CurrentPrincipal() p: Principal) { return this.service.changeStatus(id, dto, p); }
  @Roles(Role.ADMIN, Role.ASSISTANT) @Post('tickets/:id/notes') note(@Param('id') id: string, @Body() dto: AddNoteDto, @CurrentPrincipal() p: Principal) { return this.service.addNote(id, dto, p); }
  @Get('dashboard') dashboard(@CurrentPrincipal() p: Principal) { return this.service.dashboard(p); }
}
