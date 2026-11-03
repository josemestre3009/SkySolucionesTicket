import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { PrismaService } from '../infrastructure/prisma.service';
import { IS_PUBLIC } from './public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    if (typeof apiKey === 'string') {
      const client = await this.prisma.apiClient.findUnique({ where: { keyHash: createHash('sha256').update(apiKey).digest('hex') } });
      if (!client?.active) throw new UnauthorizedException('API key inválida o revocada.');
      request.principal = { id: client.id, name: client.name, role: client.role, kind: 'agent' };
      await this.prisma.apiClient.update({ where: { id: client.id }, data: { lastUsedAt: new Date() } });
      return true;
    }
    const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? request.cookies?.access_token;
    if (!bearer) throw new UnauthorizedException('Credenciales requeridas.');
    try {
      const payload = await this.jwt.verifyAsync(bearer, { secret: process.env.JWT_SECRET });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user?.active) throw new UnauthorizedException('Usuario inactivo.');
      request.principal = { id: user.id, name: user.name, role: user.role, kind: 'user' };
      return true;
    } catch { throw new UnauthorizedException('Token inválido o vencido.'); }
  }
}
