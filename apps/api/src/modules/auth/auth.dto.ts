import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
export class LoginDto {
  @ApiProperty({ example: 'admin@skysoluciones.co' }) @IsEmail() email!: string;
  @ApiProperty({ example: 'ChangeMe123!' }) @IsString() @MinLength(8) password!: string;
}
