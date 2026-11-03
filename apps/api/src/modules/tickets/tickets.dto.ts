import { TicketStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateTicketDto {
  @ApiProperty() @IsString() @MinLength(2) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsUUID() customerId!: string;
  @ApiProperty() @IsUUID() categoryId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedToId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}
export class AssignTicketDto { @ApiProperty() @IsUUID() technicianId!: string; }
export class UpdateTicketDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}
export class ChangeStatusDto {
  @ApiProperty({ enum: TicketStatus }) @IsEnum(TicketStatus) status!: TicketStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() pendingReasonId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(3) note?: string;
}
export class AddNoteDto { @ApiProperty() @IsString() @MinLength(1) body!: string; }
