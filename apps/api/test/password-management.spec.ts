import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/infrastructure/prisma.service';
import { ChangePasswordDto } from '../src/modules/auth/auth.dto';
import { AuthService } from '../src/modules/auth/auth.service';
import { ResetPasswordDto } from '../src/modules/users/users.dto';
import { UsersService } from '../src/modules/users/users.service';

const human = { id: 'user-1', name: 'Ana', role: Role.ASSISTANT, kind: 'user' as const };
const admin = { id: 'admin-1', name: 'Admin', role: Role.ADMIN, kind: 'user' as const };
const agent = { id: 'agent-1', name: 'Agente', role: Role.ADMIN, kind: 'agent' as const };

function userRecord(passwordHash: string) {
  return { id: human.id, name: human.name, email: 'ana@sky.co', role: human.role, active: true, passwordHash };
}

function setup() {
  const prisma = { user: { findUnique: vi.fn(), update: vi.fn() } };
  const jwt = { signAsync: vi.fn().mockResolvedValue('token') };
  return {
    prisma,
    jwt,
    auth: new AuthService(prisma as unknown as PrismaService, jwt as unknown as JwtService),
    users: new UsersService(prisma as unknown as PrismaService),
  };
}

async function seedUser(prisma: ReturnType<typeof setup>['prisma'], password: string) {
  let stored = await argon2.hash(password);
  prisma.user.findUnique.mockImplementation(() => Promise.resolve(userRecord(stored)));
  prisma.user.update.mockImplementation(({ data }: { data: { passwordHash: string } }) => {
    stored = data.passwordHash;
    return Promise.resolve(userRecord(stored));
  });
  return () => stored;
}

describe('cambiar mi contraseña', () => {
  let context: ReturnType<typeof setup>;
  beforeEach(() => { context = setup(); });

  it('exige la contraseña actual correcta', async () => {
    await seedUser(context.prisma, 'OldPass123');
    await expect(context.auth.changePassword(human, { currentPassword: 'WrongPass', newPassword: 'NewPass123' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(context.prisma.user.update).not.toHaveBeenCalled();
  });

  it('guarda un hash Argon2 y la nueva contraseña autentica, la anterior no', async () => {
    const stored = await seedUser(context.prisma, 'OldPass123');
    await context.auth.changePassword(human, { currentPassword: 'OldPass123', newPassword: 'NewPass123' });
    expect(stored()).toMatch(/^\$argon2/);
    expect(await argon2.verify(stored(), 'NewPass123')).toBe(true);
    await expect(context.auth.login({ email: 'ana@sky.co', password: 'OldPass123' })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(context.auth.login({ email: 'ana@sky.co', password: 'NewPass123' })).resolves.toMatchObject({ accessToken: 'token' });
  });

  it('rechaza credenciales de agente', async () => {
    await expect(context.auth.changePassword(agent, { currentPassword: 'OldPass123', newPassword: 'NewPass123' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza contraseñas nuevas de menos de 8 caracteres', async () => {
    const errors = await validate(plainToInstance(ChangePasswordDto, { currentPassword: 'OldPass123', newPassword: 'short' }));
    expect(errors.some((error) => error.property === 'newPassword')).toBe(true);
  });
});

describe('restablecer contraseña de un usuario', () => {
  let context: ReturnType<typeof setup>;
  beforeEach(() => { context = setup(); });

  it('devuelve 404 para un usuario inexistente', async () => {
    context.prisma.user.findUnique.mockResolvedValue(null);
    await expect(context.users.resetPassword('missing', { newPassword: 'NewPass123' }, admin))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('guarda un hash Argon2 y la nueva contraseña autentica', async () => {
    const stored = await seedUser(context.prisma, 'OldPass123');
    await context.users.resetPassword(human.id, { newPassword: 'NewPass123' }, admin);
    expect(await argon2.verify(stored(), 'NewPass123')).toBe(true);
    const auth = new AuthService(context.prisma as unknown as PrismaService, context.jwt as unknown as JwtService);
    await expect(auth.login({ email: 'ana@sky.co', password: 'NewPass123' })).resolves.toMatchObject({ accessToken: 'token' });
  });

  it('solo lo permite un principal humano', async () => {
    await expect(context.users.resetPassword(human.id, { newPassword: 'NewPass123' }, agent))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('obliga al administrador a usar el cambio propio para su cuenta', async () => {
    await expect(context.users.resetPassword(admin.id, { newPassword: 'NewPass123' }, admin))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(context.prisma.user.update).not.toHaveBeenCalled();
  });

  it('rechaza contraseñas nuevas de menos de 8 caracteres', async () => {
    const errors = await validate(plainToInstance(ResetPasswordDto, { newPassword: 'short' }));
    expect(errors.some((error) => error.property === 'newPassword')).toBe(true);
  });
});
