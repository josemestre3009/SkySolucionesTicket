import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@skysoluciones.co';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: 'Administrador Sky', email, passwordHash: await argon2.hash(password), role: Role.ADMIN },
  });
  const categories = [
    ['installation', 'Instalaciones', ['cedula', 'correo', 'plan', 'valorInstalacion', 'mapa', 'contrato', 'indicaciones']],
    ['failure', 'Revisiones / Fallas', ['ipCliente']],
    ['upgrade', 'Mejoras de servicio', ['ipCliente']],
    ['removal', 'Retiros', ['ipCliente', 'motivo', 'equipos']],
    ['transfer', 'Traslados', ['ipCliente', 'direccionActual', 'direccionNueva']],
    ['iptv', 'Instalaciones IPTV', ['ipCliente', 'planTv', 'decodificadores', 'valorInstalacion']],
  ] as const;
  for (const [code, name, fields] of categories) {
    await prisma.ticketCategory.upsert({ where: { code }, update: { name, fields: [...fields] }, create: { code, name, fields: [...fields] } });
  }
  for (const name of ['Cliente no estaba', 'Dirección no encontrada', 'Falta material o equipo', 'Falla de red externa', 'Otro']) {
    await prisma.pendingReason.upsert({ where: { name }, update: {}, create: { name } });
  }
}

main().finally(() => prisma.$disconnect());
