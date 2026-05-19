import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { Pool } from 'pg';
import { AUDIT_SQLITE_SCHEMA } from './schema.sqlite';

export interface DecisionEventRow {
  decision_id: string;
  tenant_id: string | null;
  session_id: string | null;
  domain: string;
  locale: string;
  io_type: string;
  text_hash: string;
  decision: string;
  risk_score: number;
  matched_rules: string[];
  categories: string[];
  policy_version: string | null;
  latency_ms: number | null;
  created_at: string;
}

export interface DecisionEventInsert {
  decisionId: string;
  tenantId?: string;
  sessionId?: string;
  domain: string;
  locale: string;
  ioType: 'input' | 'output' | 'both';
  textHash: string;
  decision: string;
  riskScore: number;
  matchedRules: string[];
  categories: string[];
  policyVersion?: string;
  latencyMs?: number;
}

type Driver = 'postgres' | 'sqlite';

/**
 * Backend-neutral DB facade for the Audit Service.
 * Mirrors the Policy-Engine DbService pattern. See its docstring.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DbService.name);
  readonly driver: Driver;
  private pg?: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sqlite?: any;
  private _available = false;
  private readonly sqlitePath: string;

  constructor() {
    this.driver = ((process.env.DB_DRIVER ?? 'postgres').toLowerCase() === 'sqlite' ? 'sqlite' : 'postgres');
    this.sqlitePath = process.env.SQLITE_PATH ?? './var/audit.db';
  }

  async onModuleInit(): Promise<void> {
    if (this.driver === 'sqlite') await this.openSqlite();
    else await this.openPostgres();
  }

  isAvailable(): boolean {
    return this._available;
  }

  private async openSqlite(): Promise<void> {
    try {
      const Database = (await import('better-sqlite3')).default;
      mkdirSync(dirname(this.sqlitePath), { recursive: true });
      this.sqlite = new Database(this.sqlitePath);
      this.sqlite.pragma('journal_mode = WAL');
      this.sqlite.pragma('synchronous = NORMAL');
      this.sqlite.exec(AUDIT_SQLITE_SCHEMA);
      this._available = true;
      this.log.log(`SQLite ready at ${this.sqlitePath}`);
    } catch (e) {
      this.log.warn(`SQLite open failed: ${(e as Error).message}`);
    }
  }

  private async openPostgres(): Promise<void> {
    this.pg = new Pool({
      host: process.env.POSTGRES_HOST ?? '127.0.0.1',
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      database: process.env.POSTGRES_DB ?? 'guardrails',
      user: process.env.POSTGRES_USER ?? 'guardrails',
      password: process.env.POSTGRES_PASSWORD ?? 'guardrails',
      max: 10,
    });
    try {
      await this.pg.query('SELECT 1');
      this._available = true;
      this.log.log('Postgres connected');
    } catch (e) {
      this.log.warn(`Postgres unavailable: ${(e as Error).message}`);
    }
  }

  // ---------------- public API ----------------

  async insertDecisionEvent(ev: DecisionEventInsert): Promise<void> {
    if (!this._available) throw new Error('db_unavailable');
    if (this.driver === 'sqlite') {
      this.sqlite
        .prepare(
          `INSERT INTO decision_events
             (decision_id, tenant_id, session_id, domain, locale, io_type,
              text_hash, decision, risk_score, matched_rules, categories,
              policy_version, latency_ms)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          ev.decisionId,
          ev.tenantId ?? null,
          ev.sessionId ?? null,
          ev.domain,
          ev.locale,
          ev.ioType,
          ev.textHash,
          ev.decision,
          ev.riskScore,
          JSON.stringify(ev.matchedRules ?? []),
          JSON.stringify(ev.categories ?? []),
          ev.policyVersion ?? null,
          ev.latencyMs ?? null,
        );
      return;
    }
    await this.pg!.query(
      `INSERT INTO decision_events
        (decision_id, tenant_id, session_id, domain, locale, io_type,
         text_hash, decision, risk_score, matched_rules, categories,
         policy_version, latency_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        ev.decisionId,
        ev.tenantId ?? null,
        ev.sessionId ?? null,
        ev.domain,
        ev.locale,
        ev.ioType,
        ev.textHash,
        ev.decision,
        ev.riskScore,
        ev.matchedRules,
        ev.categories,
        ev.policyVersion ?? null,
        ev.latencyMs ?? null,
      ],
    );
  }

  async findDecisionEvent(id: string): Promise<DecisionEventRow | null> {
    if (!this._available) return null;
    if (this.driver === 'sqlite') {
      const r = this.sqlite
        .prepare('SELECT * FROM decision_events WHERE decision_id = ?')
        .get(id) as (Omit<DecisionEventRow, 'matched_rules' | 'categories'> & {
          matched_rules: string;
          categories: string;
        }) | undefined;
      if (!r) return null;
      return {
        ...r,
        matched_rules: r.matched_rules ? (JSON.parse(r.matched_rules) as string[]) : [],
        categories: r.categories ? (JSON.parse(r.categories) as string[]) : [],
      };
    }
    const res = await this.pg!.query<DecisionEventRow>(
      'SELECT * FROM decision_events WHERE decision_id = $1',
      [id],
    );
    return res.rows[0] ?? null;
  }

  async recentDecisionEvents(limit: number): Promise<DecisionEventRow[]> {
    if (!this._available) return [];
    if (this.driver === 'sqlite') {
      const rows = this.sqlite
        .prepare('SELECT * FROM decision_events ORDER BY created_at DESC LIMIT ?')
        .all(limit) as Array<Omit<DecisionEventRow, 'matched_rules' | 'categories'> & {
          matched_rules: string;
          categories: string;
        }>;
      return rows.map((r) => ({
        ...r,
        matched_rules: r.matched_rules ? (JSON.parse(r.matched_rules) as string[]) : [],
        categories: r.categories ? (JSON.parse(r.categories) as string[]) : [],
      }));
    }
    const res = await this.pg!.query<DecisionEventRow>(
      'SELECT * FROM decision_events ORDER BY created_at DESC LIMIT $1',
      [limit],
    );
    return res.rows;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pg) await this.pg.end().catch(() => undefined);
    if (this.sqlite) this.sqlite.close();
  }
}
