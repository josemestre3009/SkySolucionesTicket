import { Role } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsEnum, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
export class CreateUserDto {
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(8) password!: string;
  @ApiProperty({ enum: Role }) @IsEnum(Role) role!: Role;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() zone?: string;
}
export class CreateApiClientDto {
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiProperty({ enum: [Role.ADMIN, Role.ASSISTANT] }) @IsIn([Role.ADMIN, Role.ASSISTANT]) role!: Role;
}
export class SetActiveDto { @ApiProperty() @IsBoolean() active!: boolean; }
