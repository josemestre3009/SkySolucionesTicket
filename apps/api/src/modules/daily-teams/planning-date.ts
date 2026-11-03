import { BadRequestException } from '@nestjs/common';

export function planningDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('Fecha inválida.');
  }
  return date;
}
