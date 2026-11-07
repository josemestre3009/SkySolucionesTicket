import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Principal } from '../../common/principal';
import { PrismaService } from '../../infrastructure/prisma.service';
import { ChangePasswordDto, LoginDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user?.active || !(await argon2.verify(user.passwordHash, dto.password))) throw new UnauthorizedException('Correo o contraseña incorrectos.');
    const accessToken = await this.jwt.signAsync({ sub: user.id, name: user.name, role: user.role });
    return { accessToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
  }
  async changePassword(principal: Principal, dto: ChangePasswordDto) {
    if (principal.kind !== 'user') throw new ForbiddenException('Solo un usuario humano puede cambiar su contraseña.');
    const user = await this.prisma.user.findUnique({ where: { id: principal.id } });
    if (!user || !(await argon2.verify(user.passwordHash, dto.currentPassword))) throw new UnauthorizedException('La contraseña actual no es correcta.');
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await argon2.hash(dto.newPassword) } });
    return { ok: true };
  }
}
