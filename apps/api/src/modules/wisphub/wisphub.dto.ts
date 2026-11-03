import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIP, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class UpdateWispHubSettingsDto {
  @ApiProperty({ example: 'https://api.wisphub.net/api/' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  baseUrl!: string;

  @ApiPropertyOptional({ description: 'Déjelo vacío para conservar la clave existente.' })
  @IsOptional() @IsString() @MinLength(12)
  apiKey?: string;

  @ApiProperty() @IsBoolean()
  enabled!: boolean;
}

export class WispHubLookupDto {
  @ApiProperty({ example: '10.20.14.87' })
  @IsIP(4)
  ip!: string;
}
