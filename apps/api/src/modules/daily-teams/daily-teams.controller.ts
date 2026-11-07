import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentPrincipal } from '../../common/current-principal.decorator';
import { Principal } from '../../common/principal';
import { Roles } from '../../common/roles.decorator';
import { AssignDailyTicketsDto, CreateDailyTeamDto, UpdateDailyTeamDto, UpdateDailyTicketOutcomeDto } from './daily-teams.dto';
import { DailyTeamsService } from './daily-teams.service';

@ApiTags('daily-planning') @ApiSecurity('agent-key') @Controller()
export class DailyTeamsController {
  constructor(private service: DailyTeamsService) {}
  @Roles(Role.ADMIN, Role.ASSISTANT, Role.TEAM_LEADER, Role.TECHNICIAN)
  @Get('daily-planning') planning(@Query('date') date: string, @CurrentPrincipal() p: Principal) { return this.service.planning(date, p); }
  @Roles(Role.ADMIN, Role.TEAM_LEADER) @Post('daily-teams') create(@Body() dto: CreateDailyTeamDto, @CurrentPrincipal() p: Principal) { return this.service.create(dto, p); }
  @Roles(Role.ADMIN, Role.TEAM_LEADER) @Patch('daily-teams/:id') update(@Param('id') id: string, @Body() dto: UpdateDailyTeamDto, @CurrentPrincipal() p: Principal) { return this.service.update(id, dto, p); }
  @Roles(Role.ADMIN, Role.TEAM_LEADER) @Post('daily-teams/:id/tickets') assign(@Param('id') id: string, @Body() dto: AssignDailyTicketsDto, @CurrentPrincipal() p: Principal) { return this.service.assign(id, dto, p); }
  @Roles(Role.ADMIN, Role.TEAM_LEADER, Role.TECHNICIAN) @Post('daily-teams/:id/tickets/:ticketId/start') start(@Param('id') id: string, @Param('ticketId') ticketId: string, @CurrentPrincipal() p: Principal) { return this.service.start(id, ticketId, p); }
  @Roles(Role.ADMIN, Role.TEAM_LEADER, Role.TECHNICIAN) @Patch('daily-teams/:id/tickets/:ticketId/outcome') outcome(@Param('id') id: string, @Param('ticketId') ticketId: string, @Body() dto: UpdateDailyTicketOutcomeDto, @CurrentPrincipal() p: Principal) { return this.service.updateOutcome(id, ticketId, dto, p); }
  @Roles(Role.ADMIN, Role.TEAM_LEADER) @Delete('daily-teams/:id/tickets/:ticketId') unassign(@Param('id') id: string, @Param('ticketId') ticketId: string, @CurrentPrincipal() p: Principal) { return this.service.unassign(id, ticketId, p); }
  @Roles(Role.ADMIN, Role.TEAM_LEADER) @Delete('daily-teams/:id') remove(@Param('id') id: string, @CurrentPrincipal() p: Principal) { return this.service.remove(id, p); }
}
