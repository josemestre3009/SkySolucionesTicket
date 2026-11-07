import { DailyTicketOutcome } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class PlanningDateDto {
  @ApiProperty({ example: '2026-11-03' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
}

export class CreateDailyTeamDto extends PlanningDateDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayUnique() @ArrayMaxSize(50) @IsUUID('4', { each: true }) technicianIds!: string[];
}

export class UpdateDailyTeamDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayUnique() @ArrayMaxSize(50) @IsUUID('4', { each: true }) technicianIds!: string[];
}

export class AssignDailyTicketsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayUnique() @ArrayMaxSize(200) @IsUUID('4', { each: true }) ticketIds!: string[];
}

export class UpdateDailyTicketOutcomeDto {
  @ApiProperty({ enum: [DailyTicketOutcome.DONE, DailyTicketOutcome.NOT_DONE] })
  @IsIn([DailyTicketOutcome.DONE, DailyTicketOutcome.NOT_DONE])
  outcome!: "DONE" | "NOT_DONE";

  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(3) @MaxLength(500) note?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() pendingReasonId?: string;
  @ApiPropertyOptional({ example: '2026-11-04' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) deferredTo?: string;
}
