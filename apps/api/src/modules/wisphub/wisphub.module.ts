import { Module } from '@nestjs/common';
import { WispHubController } from './wisphub.controller';
import { WispHubService } from './wisphub.service';

@Module({ controllers: [WispHubController], providers: [WispHubService] })
export class WispHubModule {}
