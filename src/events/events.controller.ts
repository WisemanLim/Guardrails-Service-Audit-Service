import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { EventsService } from './events.service';
import { DecisionEventSchema } from './events.types';

@Controller('events')
export class EventsController {
  constructor(private readonly svc: EventsService) {}

  @Post()
  async create(@Body() body: unknown) {
    const parsed = DecisionEventSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ error: 'invalid', issues: parsed.error.flatten() }, HttpStatus.BAD_REQUEST);
    }
    return this.svc.record(parsed.data);
  }

  @Get(':id')
  async byId(@Param('id') id: string) {
    const found = await this.svc.findById(id);
    if (!found) throw new HttpException('not_found', HttpStatus.NOT_FOUND);
    return found;
  }

  @Get()
  async recent(@Query('limit') limit?: string) {
    return { items: await this.svc.recent(limit ? Math.min(Number(limit), 1000) : 100) };
  }
}
