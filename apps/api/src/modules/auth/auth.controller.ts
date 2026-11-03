import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentPrincipal } from '../../common/current-principal.decorator';
import { Principal } from '../../common/principal';
import { Public } from '../../common/public.decorator';
import { LoginDto } from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('auth') @Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  @Public() @Post('login') async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(dto);
    response.cookie('access_token', result.accessToken, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 });
    return result;
  }
  @Post('logout') logout(@Res({ passthrough: true }) response: Response) { response.clearCookie('access_token'); return { ok: true }; }
  @ApiBearerAuth() @Get('me') me(@CurrentPrincipal() principal: Principal) { return principal; }
}
