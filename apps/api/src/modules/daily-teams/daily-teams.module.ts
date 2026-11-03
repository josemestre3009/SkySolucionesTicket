import { Module } from '@nestjs/common';
import { DailyTeamsController } from './daily-teams.controller';
import { DailyTeamsService } from './daily-teams.service';

@Module({ controllers: [DailyTeamsController], providers: [DailyTeamsService] })
export class DailyTeamsModule {}
