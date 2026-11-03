import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './common/auth.guard';
import { RolesGuard } from './common/roles.guard';
import { PrismaModule } from './infrastructure/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogsModule } from './modules/catalogs/catalogs.module';
import { CustomersModule } from './modules/customers/customers.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { UsersModule } from './modules/users/users.module';
import { WispHubModule } from './modules/wisphub/wisphub.module';
import { DailyTeamsModule } from './modules/daily-teams/daily-teams.module';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, CatalogsModule, CustomersModule, TicketsModule, WispHubModule, DailyTeamsModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
