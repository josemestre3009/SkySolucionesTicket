import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Principal } from './principal';
export const CurrentPrincipal = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => ctx.switchToHttp().getRequest().principal);
