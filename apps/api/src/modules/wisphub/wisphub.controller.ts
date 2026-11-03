import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/roles.decorator';
import { UpdateWispHubSettingsDto, WispHubLookupDto } from './wisphub.dto';
import { WispHubService } from './wisphub.service';

@ApiTags('integrations') @ApiSecurity('agent-key') @Controller('integrations/wisphub')
export class WispHubController {
  constructor(private service: WispHubService) {}
  @Roles(Role.ADMIN, Role.ASSISTANT) @Get('status') status() { return this.service.status(); }
  @Roles(Role.ADMIN) @Get('settings') settings() { return this.service.publicSettings(); }
  @Roles(Role.ADMIN) @Patch('settings') update(@Body() dto: UpdateWispHubSettingsDto) { return this.service.update(dto); }
  @Roles(Role.ADMIN) @Post('test') test() { return this.service.test(); }
  @Roles(Role.ADMIN, Role.ASSISTANT) @Post('lookup') lookup(@Body() dto: WispHubLookupDto) { return this.service.lookupByIp(dto.ip); }
  @Roles(Role.ADMIN, Role.ASSISTANT) @Get('installations') installations() { return this.service.installations(); }
}
