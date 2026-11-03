import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

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
