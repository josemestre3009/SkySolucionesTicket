import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Roles } from '../../common/roles.decorator';
import { PrismaService } from '../../infrastructure/prisma.service';

class CategoryDto {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9-]+$/) code!: string;
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) fields?: string[];
}
class UpdateCategoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) fields?: string[];
}
class PendingReasonDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) name!: string;
}
class UpdatePendingReasonDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
class CompanySettingsDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) companyName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) supportPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() supportEmail?: string;
  @ApiProperty({ enum: ['America/Bogota', 'America/Caracas', 'America/Lima'] }) @IsIn(['America/Bogota', 'America/Caracas', 'America/Lima']) timezone!: string;
  @ApiProperty() @IsString() @Matches(/^[A-Z0-9-]{1,8}$/) ticketPrefix!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) businessHours?: string;
}

@ApiTags('catalogs') @Controller('categories')
export class CatalogsController {
  constructor(private prisma: PrismaService) {}
  @Get() list() { return this.prisma.ticketCategory.findMany({ orderBy: { name: 'asc' } }); }
  @Roles(Role.ADMIN) @Post() create(@Body() dto: CategoryDto) { return this.prisma.ticketCategory.create({ data: { ...dto, fields: dto.fields ?? [] } }); }
  @Roles(Role.ADMIN) @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) { return this.prisma.ticketCategory.update({ where: { id }, data: dto }); }

  @Get('/pending-reasons/list') reasons() { return this.prisma.pendingReason.findMany({ where: { active: true }, orderBy: { name: 'asc' } }); }

  @Roles(Role.ADMIN) @Get('/pending-reasons/all') allReasons() { return this.prisma.pendingReason.findMany({ orderBy: { name: 'asc' } }); }
  @Roles(Role.ADMIN) @Post('/pending-reasons') createReason(@Body() dto: PendingReasonDto) { return this.prisma.pendingReason.create({ data: dto }); }
  @Roles(Role.ADMIN) @Patch('/pending-reasons/:id') updateReason(@Param('id') id: string, @Body() dto: UpdatePendingReasonDto) { return this.prisma.pendingReason.update({ where: { id }, data: dto }); }

  @Roles(Role.ADMIN) @Get('/company/settings') settings() { return this.prisma.companySettings.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default' } }); }
  @Roles(Role.ADMIN) @Patch('/company/settings') updateSettings(@Body() dto: CompanySettingsDto) { return this.prisma.companySettings.upsert({ where: { id: 'default' }, update: dto, create: { id: 'default', ...dto } }); }
}
