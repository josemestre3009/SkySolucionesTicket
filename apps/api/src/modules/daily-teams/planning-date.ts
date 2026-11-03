import { BadRequestException } from '@nestjs/common';

export function planningDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('Fecha inválida.');
  }
  return date;
}

// ponytail: one operational timezone for "today"; add per-company timezone only if a second zone is needed.
export function currentPlanningDate(now = new Date(), timeZone = process.env.APP_TIMEZONE ?? 'America/Bogota') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function currentPlanningWorkDate() {
  return new Date(`${currentPlanningDate()}T00:00:00.000Z`);
}
