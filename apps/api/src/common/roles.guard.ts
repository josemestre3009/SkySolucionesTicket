import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    const principal = context.switchToHttp().getRequest().principal;
    if (!principal || !roles.includes(principal.role)) throw new ForbiddenException('Permiso insuficiente.');
    return true;
  }
}
