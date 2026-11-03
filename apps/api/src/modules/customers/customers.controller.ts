import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { Roles } from '../../common/roles.decorator';
import { PrismaService } from '../../infrastructure/prisma.service';
class CustomerDto {
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() document?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
}
class UpdateCustomerDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() document?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
}
@ApiTags('customers') @Roles(Role.ADMIN, Role.ASSISTANT) @Controller('customers')
export class CustomersController {
  constructor(private prisma: PrismaService) {}
  @Get() list(@Query('q') q = '') { return this.prisma.customer.findMany({ where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { document: { contains: q } }] } : {}, take: 50, orderBy: { name: 'asc' } }); }
  @Post() create(@Body() dto: CustomerDto) { return this.prisma.customer.create({ data: dto }); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) { return this.prisma.customer.update({ where: { id }, data: dto }); }
}
