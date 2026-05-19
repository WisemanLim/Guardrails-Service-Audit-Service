import { Controller, Get } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DbService) {}
  @Get()
  health() {
    return { status: 'ok', db: { driver: this.db.driver, available: this.db.isAvailable() } };
  }
}
