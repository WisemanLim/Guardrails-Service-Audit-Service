import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DbService } from '../db/db.service';
import { DecisionEvent } from './events.types';

@Injectable()
export class EventsService {
  private readonly log = new Logger(EventsService.name);
  private readonly memoryBuffer: DecisionEvent[] = [];
  private readonly memoryLimit = 1000;

  constructor(private readonly db: DbService) {}

  async record(ev: DecisionEvent): Promise<{ decisionId: string }> {
    const id = ev.decisionId ?? randomUUID();
    if (!this.db.isAvailable()) {
      this.memoryBuffer.push({ ...ev, decisionId: id });
      if (this.memoryBuffer.length > this.memoryLimit) this.memoryBuffer.shift();
      return { decisionId: id };
    }
    await this.db.insertDecisionEvent({
      decisionId: id,
      tenantId: ev.tenantId,
      sessionId: ev.sessionId,
      domain: ev.domain,
      locale: ev.locale,
      ioType: ev.ioType,
      textHash: ev.textHash,
      decision: ev.decision,
      riskScore: ev.riskScore,
      matchedRules: ev.matchedRules,
      categories: ev.categories,
      policyVersion: ev.policyVersion,
      latencyMs: ev.latencyMs,
    });
    return { decisionId: id };
  }

  async findById(decisionId: string): Promise<unknown | null> {
    if (this.db.isAvailable()) {
      return this.db.findDecisionEvent(decisionId);
    }
    return this.memoryBuffer.find((e) => e.decisionId === decisionId) ?? null;
  }

  async recent(limit = 100): Promise<unknown[]> {
    if (this.db.isAvailable()) {
      return this.db.recentDecisionEvents(limit);
    }
    return this.memoryBuffer.slice(-limit).reverse();
  }
}
