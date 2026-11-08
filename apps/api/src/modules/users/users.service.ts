import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma.service';
import { Principal } from '../../common/principal';
import { CreateApiClientDto, CreateUserDto, ResetPasswordDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  list() { return this.prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, phone: true, active: true }, orderBy: { name: 'asc' } }); }
  technicians() { return this.prisma.user.findMany({ where: { role: 'TECHNICIAN', active: true }, select: { id: true, name: true, role: true, active: true }, orderBy: { name: 'asc' } }); }
  async create(dto: CreateUserDto) {
    const { password, ...data } = dto;
    try { return await this.prisma.user.create({ data: { ...data, email: dto.email.toLowerCase(), passwordHash: await argon2.hash(password) }, select: { id: true, name: true, email: true, role: true } }); }
    catch { throw new ConflictException('El correo ya existe.'); }
  }
  async setUserActive(id: string, active: boolean, principal: Principal) {
    if (id === principal.id && !active) throw new ForbiddenException('No puede desactivar su propia cuenta.');
    const found = await this.prisma.user.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Empleado no encontrado.');
    return this.prisma.user.update({ where: { id }, data: { active }, select: { id: true, name: true, email: true, role: true, phone: true, active: true } });
  }
  async resetPassword(id: string, dto: ResetPasswordDto, principal: Principal) {
    if (principal.kind !== 'user') throw new ForbiddenException('Solo un administrador humano puede restablecer contraseñas.');
    if (id === principal.id) throw new ForbiddenException('Use el cambio de contraseña de su cuenta.');
    const found = await this.prisma.user.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Empleado no encontrado.');
    return this.prisma.user.update({ where: { id }, data: { passwordHash: await argon2.hash(dto.newPassword) }, select: { id: true, name: true, email: true } });
  }
  agents() { return this.prisma.apiClient.findMany({ select: { id: true, name: true, keyPrefix: true, role: true, active: true, lastUsedAt: true, createdAt: true } }); }
  async createAgent(dto: CreateApiClientDto, creator: Principal) {
    if (creator.kind !== 'user') throw new ForbiddenException('Solo un administrador humano puede crear credenciales de agente.');
    const key = `sky_${randomBytes(32).toString('base64url')}`;
    const client = await this.prisma.apiClient.create({ data: { name: dto.name, role: dto.role, keyPrefix: key.slice(0, 12), keyHash: createHash('sha256').update(key).digest('hex'), createdById: creator.id } });
    return { id: client.id, name: client.name, role: client.role, apiKey: key, warning: 'Guarde esta clave ahora. No volverá a mostrarse.' };
  }
  async setAgentActive(id: string, active: boolean) {
    const found = await this.prisma.apiClient.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Agente no encontrado.');
    return this.prisma.apiClient.update({ where: { id }, data: { active }, select: { id: true, name: true, active: true } });
  }
}
