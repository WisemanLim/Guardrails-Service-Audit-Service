import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { EventsModule } from './events/events.module';
import { DbModule } from './db/db.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule, EventsModule],
  controllers: [HealthController],
})
export class AppModule {}
