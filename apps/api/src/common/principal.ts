import { Role } from '@prisma/client';

export type Principal = { id: string; name: string; role: Role; kind: 'user' | 'agent' };

declare module 'express-serve-static-core' {
  interface Request { principal?: Principal; }
}
