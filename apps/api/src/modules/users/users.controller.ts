import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentPrincipal } from '../../common/current-principal.decorator';
import { Principal } from '../../common/principal';
import { Roles } from '../../common/roles.decorator';
import { CreateApiClientDto, CreateUserDto, ResetPasswordDto, SetActiveDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('users') @ApiSecurity('agent-key') @Controller()
export class UsersController {
  constructor(private service: UsersService) {}
  @Roles(Role.ADMIN) @Get('users') list() { return this.service.list(); }
  @Roles(Role.ADMIN, Role.ASSISTANT, Role.TEAM_LEADER) @Get('technicians') technicians() { return this.service.technicians(); }
  @Roles(Role.ADMIN) @Post('users') create(@Body() dto: CreateUserDto) { return this.service.create(dto); }
  @Roles(Role.ADMIN) @Patch('users/:id/active') userActive(@Param('id') id: string, @Body() dto: SetActiveDto, @CurrentPrincipal() p: Principal) { return this.service.setUserActive(id, dto.active, p); }
  @Roles(Role.ADMIN) @Patch('users/:id/password') userPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto, @CurrentPrincipal() p: Principal) { return this.service.resetPassword(id, dto, p); }
  @Roles(Role.ADMIN) @Get('api-clients') agents() { return this.service.agents(); }
  @Roles(Role.ADMIN) @Post('api-clients') createAgent(@Body() dto: CreateApiClientDto, @CurrentPrincipal() p: Principal) { return this.service.createAgent(dto, p); }
  @Roles(Role.ADMIN) @Patch('api-clients/:id/active') active(@Param('id') id: string, @Body() dto: SetActiveDto) { return this.service.setAgentActive(id, dto.active); }
}
