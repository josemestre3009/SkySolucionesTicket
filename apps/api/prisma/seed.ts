import { Prisma, PrismaClient, Role, TicketStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@skysoluciones.co';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: 'Administrador Sky', email, passwordHash: await argon2.hash(password), role: Role.ADMIN },
  });
  const staffPassword = await argon2.hash(password);
  const technicians = await Promise.all([
    ['Luis Pérez', 'luis@skysoluciones.co', '3157781122', 'Río Seco · El Carmen'],
    ['Jorge Soto', 'jorge@skysoluciones.co', '3128894455', 'Villa Rosa · La Esperanza'],
    ['Diego Muñoz', 'diego@skysoluciones.co', '3209915566', 'San José · Los Almendros'],
  ].map(([name, staffEmail, phone, zone]) => prisma.user.upsert({
    where: { email: staffEmail }, update: {},
    create: { name, email: staffEmail, passwordHash: staffPassword, role: Role.TECHNICIAN, phone, zone },
  })));
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

  const currentTickets = await prisma.ticket.count();
  if (currentTickets < 20) {
    const categoryRows = await prisma.ticketCategory.findMany();
    const category = Object.fromEntries(categoryRows.map((item) => [item.code, item.id]));
    const reasonRows = await prisma.pendingReason.findMany();
    const reason = Object.fromEntries(reasonRows.map((item) => [item.name, item.id]));
    const day = 24 * 60 * 60 * 1000;
    type Sample = {
      customer: [string, string, string, string?]; title: string; description: string;
      categoryId: string; status: TicketStatus; customFields: Prisma.InputJsonObject;
      assignedToId?: string; pendingReasonId?: string; pendingNote?: string;
      scheduledAt?: Date; resolvedAt?: Date; note?: string;
    };
    const samples: Sample[] = [
      { customer: ['Ana Abigail Pineda', '3014869926', 'Río Seco Verdecia', '1066741934'], title: 'Instalación de internet 10 MB', description: 'Cliente nuevo. Prefiere visita en la mañana.', categoryId: category.installation, assignedToId: technicians[0].id, status: TicketStatus.IN_PROGRESS, scheduledAt: new Date(Date.now() + day), customFields: { cedula: '1066741934', plan: '10 MB', valorInstalacion: '$150.000' }, note: 'Técnico confirmó desplazamiento al sitio.' },
      { customer: ['Carlos Andrés Mejía', '3127745521', 'Villa Rosa'], title: 'Sin servicio de internet', description: 'Luz LOS roja desde ayer. El cliente ya reinició el equipo.', categoryId: category.failure, assignedToId: technicians[1].id, status: TicketStatus.PENDING, pendingReasonId: reason['Falla de red externa'], pendingNote: 'La caja del sector está sin señal. Se requiere revisión de red.', customFields: { ipCliente: '10.20.14.87' }, note: 'Escalado a cuadrilla de red externa.' },
      { customer: ['Keyla Patricia Mendoza', '3218876543', 'El Carmen', '1067889012'], title: 'Instalación de internet 20 MB', description: 'Casa frente a la cancha principal.', categoryId: category.installation, assignedToId: technicians[2].id, status: TicketStatus.PENDING, scheduledAt: new Date(Date.now() + 2 * day), customFields: { cedula: '1067889012', plan: '20 MB' } },
      { customer: ['Pedro Luis Barrios', '3046652210', 'San José'], title: 'Traslado de servicio', description: 'Cambio de vivienda. Mantener el mismo plan.', categoryId: category.transfer, status: TicketStatus.PENDING, customFields: { ipCliente: '10.20.22.19', direccionActual: 'San José, calle 4', direccionNueva: 'El Carmen, carrera 2' } },
      { customer: ['María Fernanda Cantillo', '3015547788', 'Villa Rosa'], title: 'Internet intermitente', description: 'El servicio se cae varias veces durante el día.', categoryId: category.failure, assignedToId: technicians[1].id, status: TicketStatus.IN_PROGRESS, customFields: { ipCliente: '10.20.14.31' }, note: 'Se están validando niveles de potencia.' },
      { customer: ['Luz Marina Ortega', '3205561230', 'El Carmen'], title: 'Retiro de equipos por cancelación', description: 'Cliente se muda fuera de la zona de cobertura.', categoryId: category.removal, assignedToId: technicians[0].id, status: TicketStatus.PENDING, pendingReasonId: reason['Cliente no estaba'], pendingNote: 'Se visitó dos veces y no hubo respuesta.', customFields: { ipCliente: '10.20.08.54', motivo: 'Cambio de ciudad', equipos: 'ONT y decodificador' } },
      { customer: ['Yesenia Paola Díaz', '3001239876', 'Los Almendros'], title: 'Instalación IPTV en dos televisores', description: 'Ya cuenta con internet activo.', categoryId: category.iptv, assignedToId: technicians[2].id, status: TicketStatus.PENDING, scheduledAt: new Date(Date.now() + day), customFields: { ipCliente: '10.20.17.203', planTv: 'IPTV Full', decodificadores: '2' } },
      { customer: ['José Gregorio Ruiz', '3112204455', 'La Esperanza'], title: 'Mejorar cobertura WiFi segundo piso', description: 'La señal no llega a dos habitaciones.', categoryId: category.upgrade, assignedToId: technicians[1].id, status: TicketStatus.RESOLVED, resolvedAt: new Date(Date.now() - day), customFields: { ipCliente: '10.20.31.112' }, note: 'Se reubicó el router y se validó cobertura.' },
      { customer: ['Daniela Rojas', '3009871234', 'Río Seco Verdecia'], title: 'Instalación de internet 5 MB', description: 'Casa de un piso con fácil acceso.', categoryId: category.installation, assignedToId: technicians[0].id, status: TicketStatus.RESOLVED, resolvedAt: new Date(Date.now() - 2 * day), customFields: { cedula: '1066001122', plan: '5 MB', valorInstalacion: '$150.000' }, note: 'Instalación finalizada y servicio probado.' },
      { customer: ['Hernán Darío Castro', '3145566778', 'Los Almendros'], title: 'Retiro de ONT', description: 'Cancelación voluntaria del servicio.', categoryId: category.removal, assignedToId: technicians[2].id, status: TicketStatus.RESOLVED, resolvedAt: new Date(Date.now() - 3 * day), customFields: { ipCliente: '10.20.19.77', motivo: 'Cancelación', equipos: 'ONT' } },
      { customer: ['Rafael Antonio Pérez', '3126654321', 'San José'], title: 'Nueva instalación residencial', description: 'Solicita visita durante la tarde.', categoryId: category.installation, status: TicketStatus.PENDING, customFields: { cedula: '1065432109', plan: '10 MB', indicaciones: 'Portón azul junto a la tienda' } },
      { customer: ['Sonia Patricia López', '3154409821', 'El Carmen'], title: 'Cambio a plan de 30 MB', description: 'Cliente requiere mayor velocidad por teletrabajo.', categoryId: category.upgrade, assignedToId: technicians[0].id, status: TicketStatus.PENDING, scheduledAt: new Date(Date.now() + 3 * day), customFields: { ipCliente: '10.20.08.91' } },
      { customer: ['Andrés Felipe Torres', '3028874102', 'La Esperanza'], title: 'Decodificador IPTV sin señal', description: 'Pantalla negra desde la actualización nocturna.', categoryId: category.failure, assignedToId: technicians[1].id, status: TicketStatus.PENDING, customFields: { ipCliente: '10.20.31.205' } },
      { customer: ['Mónica Acosta', '3163329054', 'Villa Rosa'], title: 'Traslado a nueva vivienda', description: 'Solicita instalación antes del fin de semana.', categoryId: category.transfer, assignedToId: technicians[1].id, status: TicketStatus.IN_PROGRESS, customFields: { ipCliente: '10.20.14.155', direccionActual: 'Villa Rosa, sector norte', direccionNueva: 'La Esperanza, calle 8' } },
      { customer: ['Óscar Mendoza', '3007764120', 'Río Seco Verdecia'], title: 'Router no enciende', description: 'No presenta luces aunque está conectado.', categoryId: category.failure, assignedToId: technicians[0].id, status: TicketStatus.PENDING, pendingReasonId: reason['Falta material o equipo'], pendingNote: 'Se requiere router de reemplazo.', customFields: { ipCliente: '10.20.05.66' } },
      { customer: ['Paola Andrea Jiménez', '3135098812', 'San José'], title: 'Instalación IPTV plan familiar', description: 'Instalación en sala y habitación principal.', categoryId: category.iptv, status: TicketStatus.PENDING, customFields: { ipCliente: '10.20.22.88', planTv: 'Familiar HD', decodificadores: '2' } },
      { customer: ['Camilo Enrique Salas', '3106642077', 'Los Almendros'], title: 'Optimización de red interna', description: 'Baja velocidad en oficina doméstica.', categoryId: category.upgrade, assignedToId: technicians[2].id, status: TicketStatus.IN_PROGRESS, customFields: { ipCliente: '10.20.17.144' }, note: 'Revisión de cableado y canal WiFi en curso.' },
      { customer: ['Gloria Inés Márquez', '3178821904', 'El Carmen'], title: 'Retiro de servicio IPTV', description: 'Mantiene internet, cancela únicamente televisión.', categoryId: category.removal, assignedToId: technicians[0].id, status: TicketStatus.PENDING, customFields: { ipCliente: '10.20.08.118', motivo: 'Reducción de gastos', equipos: '2 decodificadores' } },
      { customer: ['Javier Eduardo Peña', '3057719033', 'La Esperanza'], title: 'Sin navegación con equipos conectados', description: 'El router entrega WiFi pero no abre páginas.', categoryId: category.failure, assignedToId: technicians[1].id, status: TicketStatus.RESOLVED, resolvedAt: new Date(Date.now() - day), customFields: { ipCliente: '10.20.31.73' }, note: 'DNS corregido y navegación validada.' },
      { customer: ['Natalia Gómez Herrera', '3184407621', 'Villa Rosa'], title: 'Instalación empresarial 50 MB', description: 'Pequeño comercio con seis puestos de trabajo.', categoryId: category.installation, assignedToId: technicians[2].id, status: TicketStatus.PENDING, scheduledAt: new Date(Date.now() + 4 * day), customFields: { cedula: '1068123401', correo: 'natalia.gomez@example.com', plan: '50 MB empresarial', valorInstalacion: '$220.000', indicaciones: 'Local frente al parque' } },
    ];
    for (const sample of samples.slice(currentTickets, 20)) {
      const { customer: customerData, ...ticketData } = sample;
      const { note, ...data } = ticketData;
      const customer = await prisma.customer.create({ data: { name: customerData[0], phone: customerData[1], address: customerData[2], document: customerData[3] } });
      const ticket = await prisma.ticket.create({ data: { ...data, customerId: customer.id } });
      await prisma.ticketEvent.create({ data: { ticketId: ticket.id, actorId: admin.id, type: 'TICKET_CREATED', data: { source: 'seed' } } });
      if (note) await prisma.ticketNote.create({ data: { ticketId: ticket.id, authorId: admin.id, body: note } });
    }
  }
}

main().finally(() => prisma.$disconnect());
