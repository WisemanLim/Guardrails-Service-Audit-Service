# `src/db/db.service.ts` — Level 2 Review

## Pre-Review Header
- 역할: Postgres/SQLite 듀얼 드라이버 DB facade. decision_events 적재/조회 API 3종.
- 진입점에서의 거리: 3 (main → AppModule → DbModule → DbService)
- 라인 수: 206 (LOC 한계 600 이하 — block-mode 비강제이지만 가독성 위해 5 블록으로 분할)
- 주요 export: `DbService`, `DecisionEventRow`, `DecisionEventInsert`
- 의존 모듈 (internal): `./schema.sqlite` (AUDIT_SQLITE_SCHEMA)
- 사용된 외부 패키지: `@nestjs/common` (Injectable, Logger, OnModuleInit/Destroy), `fs` (mkdirSync), `path` (dirname), `pg` (Pool), `better-sqlite3` (동적 import)
- 부수효과: Postgres 연결 풀 생성, SQLite 파일 생성 + WAL pragma, 디렉토리 생성, 로그 출력
- 동시성 모델:
  - Postgres: `pg.Pool(max:10)` — 풀 기반, async/await
  - SQLite: better-sqlite3는 **동기 API**. async 메서드 안에서 호출되어 사실상 동기 실행 → 이벤트 루프 블로킹.
- 테스트 커버리지 흔적: 없음

## Source & Analysis (block-mode)

### Block 1/5 — Imports & Types

```ts path=src/db/db.service.ts lines=1-40
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
```

**분석 / Analysis**

- **L1 imports**: Nest 라이프사이클 인터페이스 사용. `OnModuleInit`은 부트스트랩 중 한 번 호출, `OnModuleDestroy`는 graceful shutdown 시 호출.
- **L2-3 `fs.mkdirSync` / `path.dirname`**: SQLite 파일 위치 디렉토리 자동 생성 (`./var/audit.db` → `./var`).
- **L4 `pg.Pool`**: pg 클라이언트의 connection pool. 자체 keep-alive, automatic reconnect 없음 — 명시적 query 호출 시 idle conn 재사용.
- **L5 schema 상수**: 별도 파일에서 DDL을 가져옴. CI/CD에서 alembic 등을 쓰지 않고 코드 내장 마이그레이션.
- **L7-22 `DecisionEventRow`**: snake_case (DB 표준)로 정의. `decision_id`/`created_at`이 string — Postgres는 `Date` 객체로 줄 수 있지만 pg 기본 설정이면 timestamp는 Date 객체로 반환. **불일치**: pg는 기본적으로 timestamp를 Date로 반환하므로 `string` 타입은 부정확. 컨트롤러에서 JSON.stringify 시 Date가 자동 ISO 문자열로 직렬화되어 외부에서는 string으로 보이지만, 내부 TS 타입은 잘못된 가드.
  - 흔한 실수: 응답 객체 가공 시 `row.created_at.split('T')` 같이 string으로 다루면 런타임 TypeError. 현재 코드는 row를 가공 없이 반환하므로 안전.
- **L24-38 `DecisionEventInsert`**: camelCase — application 도메인 입력 타입. snake↔camel 매핑이 `insertDecisionEvent`에서 수행.
  - `ioType`을 union literal로 좁힘 — zod 검증을 통과한 데이터이므로 OK.
- **L40 `type Driver`**: union literal로 드라이버 식별.

**짚어볼 점 / Watch-outs**
- `DecisionEventRow.created_at: string`은 pg 기본 반환 타입(Date)과 불일치. 향후 정렬/포맷팅 시 버그 후보.
- `DecisionEventRow.risk_score: number` — Postgres `NUMERIC`은 pg 기본 설정에서 **문자열**로 반환됨 (`pg.types.setTypeParser(1700, parseFloat)` 미설정). 실제로는 `'0.98'` 같은 string. 컨트롤러가 그대로 직렬화하여 클라이언트에 string으로 전달됨. 타입과 런타임 불일치.

---

### Block 2/5 — Class skeleton & lifecycle

```ts path=src/db/db.service.ts lines=42-101
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
```

**분석 / Analysis**

- **L46 `@Injectable()`**: Nest provider 마킹. DI 컨테이너가 인스턴스 1개 생성(default scope: SINGLETON).
- **L48-49 `private readonly log` / `readonly driver`**: `driver`는 외부 접근 가능(`HealthController.health()`에서 읽음).
- **L50 `private pg?: Pool`**: 옵셔널 — sqlite 모드에선 undefined. 이후 `this.pg!.query`로 non-null assertion 사용 (분기 후 안전).
- **L52 `private sqlite?: any`**: `any` 타입. `better-sqlite3`의 `Database` 인스턴스이지만 동적 import + 타입 의존성 회피를 위해 `any`. eslint-disable 명시 — 의도된 선택.
  - 흔한 실수: `any`로 두면 `prepare`/`run`/`pragma` 오타가 런타임까지 끌려감. 작은 API 표면이라 비용은 낮지만, 별도 `interface SqliteLike { prepare(...): {...} }`로 좁히는 게 안전.
- **L53 `_available`**: snake_case private 필드. 명시적 getter(`isAvailable()`)로 캡슐화.
- **L56-59 constructor**:
  - `process.env.DB_DRIVER ?? 'postgres'`. 빈 문자열 `""`는 falsy가 아니라 ?? 통과 → `''` → `.toLowerCase() === 'sqlite'` → false → `'postgres'`로 정상 처리됨. OK.
  - `process.env.SQLITE_PATH ?? './var/audit.db'`. 환경에 따라 컨테이너의 ephemeral fs에 쓰임 — 데이터 영속화 필요 시 볼륨 마운트 필수.
- **L61-64 `onModuleInit`**: 드라이버 분기 후 비동기 open. 실패해도 throw하지 않음 — `_available=false` 유지하고 부팅은 계속. 의도된 graceful degradation.
  - 흔한 실수: 운영 환경에서 DB 미가용을 silent 허용하면 운영자가 알기 어려움. health 응답으로 노출하는 게 유일한 신호인데, 현재 `status:'ok'` 그대로라 readiness 신호로 부적합 (§4 핫스팟).
- **L70-83 `openSqlite`**:
  - `(await import('better-sqlite3')).default` — 동적 import. Postgres 모드에서 better-sqlite3 native 모듈 로드를 회피. tsconfig `module=commonjs`라 컴파일 결과는 `require()`로 변환되지만 미참조 시 미로드.
  - `mkdirSync(... { recursive: true })` — idempotent.
  - `journal_mode=WAL`: write-ahead logging. 동시 읽기/쓰기 성능 향상. WAL 파일(`audit.db-wal`, `audit.db-shm`)이 추가로 생성됨 — 백업/볼륨 정책에 포함되어야.
  - `synchronous=NORMAL`: WAL과 함께 일반 권장 설정. FULL보다 빠르고 충돌 시 데이터 손실 위험 약간 증가하지만 audit 로그는 보통 수용 가능.
  - `exec(AUDIT_SQLITE_SCHEMA)`: 부팅마다 idempotent `CREATE TABLE IF NOT EXISTS` 실행.
  - try/catch가 모든 error를 swallow — 부팅 차단 안 함. log.warn만.
- **L85-101 `openPostgres`**:
  - `new Pool({...})`: 기본값 매우 약함. `POSTGRES_PASSWORD ?? 'guardrails'` 하드코딩은 운영 위험.
  - `Number(process.env.POSTGRES_PORT ?? 5432)`: PORT NaN 가능성 (`main.ts`와 동일 패턴).
  - `await this.pg.query('SELECT 1')`: 부팅 시 ping. 실패하면 `_available=false`로 fallback 모드. 그러나 pg.Pool은 한 번 실패해도 이후 reconnect 시도 가능 — 코드에는 재시도 로직 없음. **부팅 후 DB 복구되면 `_available` 영원히 false** (재시도 메커니즘 부재).
  - 흔한 실수: Pool 자체는 lazy connection이므로 `SELECT 1`이 실제 연결 검사로 적절. 그러나 keep-alive/health refresh가 없다.

**짚어볼 점 / Watch-outs**
- Postgres 기본 비밀번호 하드코딩 — 12-factor 위반 + 보안.
- DB 미가용 → fallback이지만 **복구 자동 재연결 없음**. 운영 환경에서 일시 장애 후 영구 메모리 모드로 들어가는 위험.
- SQLite 호출은 동기 — async 메서드 내부에서 호출되어도 이벤트 루프 블로킹.

---

### Block 3/5 — Insert API

```ts path=src/db/db.service.ts lines=103-155
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
```

**분석 / Analysis**

- **L106 `if (!this._available) throw new Error('db_unavailable')`**: 가용 검사. `EventsService.record`가 호출 전에 `db.isAvailable()`로 가드하므로 이 throw는 도달 안 될 것으로 기대. 그러나 race condition(부팅 직후 / shutdown 직전)에서 가능.
  - 흔한 실수: 호출자가 `isAvailable()`로 확인 후 호출 사이에 DB가 죽으면 throw. `EventsController`는 이 throw를 잡지 않음 → Nest 기본 필터가 500 반환. OK 거동이지만 명시적이지 않음.
- **L107-131 sqlite 분기**:
  - `this.sqlite.prepare(...).run(...)`: better-sqlite3의 prepared statement. **동기** 실행. 매 INSERT마다 새 prepare — better-sqlite3는 prepare가 가벼우나 hot-path라면 statement caching이 더 빠름.
    - 권장: `private insertStmt = this.sqlite.prepare(...)`로 캐싱.
  - 파라미터 13개를 positional `?`로 바인딩. SQL injection은 prepared statement로 방지됨.
  - `JSON.stringify(ev.matchedRules ?? [])`: SQLite는 배열 타입 없음 → JSON 인코딩. 일관되게 `findDecisionEvent`/`recent`에서 `JSON.parse` 적용.
  - 흔한 실수: `JSON.stringify` 결과가 5MB 등 매우 크면 SQLite row limit (1GB)에 못 미치더라도 메모리 비용. matchedRules가 보통 짧음 — 실제 위험 낮음.
  - 빈 배열은 `JSON.stringify([]) === '[]'`로 저장 — `IS NOT NULL` 검색에 잘 걸림.
  - **부수효과**: 동기 메서드라서 함수 안에서 throw할 수도 있는데(예: WAL 파일 fs 오류) catch 없음. async wrapper로 throw가 promise reject로 변환되어 호출자에 전달.
  - `return;` 후 함수 종료.
- **L133-154 postgres 분기**:
  - `$1..$13` placeholder, pg 자체 escaping. SQL injection 안전.
  - `ev.matchedRules` / `ev.categories`: pg는 자바스크립트 배열을 자동으로 `TEXT[]`로 변환. **단**, `null` 또는 `undefined` 배열은 자동 변환 실패 가능. zod 스키마에서 `.default([])`로 보장되어 정상 케이스에서는 무해.
  - 흔한 실수: pg에서 `string[]`을 binary array로 보낼 때 quote escaping이 자동이지만, 빈 배열 `[]`은 pg가 `'{}'`로 직렬화. OK.
  - `await this.pg!.query(...)`: `pg!`는 non-null assertion. 분기 조건상 `driver==='postgres'`이면 `pg`가 초기화되어 있지만, lifecycle 오류로 `onModuleInit` 실패하면 undefined일 수 있음 → `_available` 체크로 차단됨.
- **반환값 `Promise<void>`**: 호출자(`EventsService`)는 응답으로 `decisionId`만 반환. INSERT 실패 시 throw → Nest 500.

**짚어볼 점 / Watch-outs**
- prepare statement caching 부재 (SQLite 모드 hot-path).
- pg.Pool 쿼리에서 `client = await pool.connect()` + `client.release()` 패턴이 아니라 `pool.query(...)`로 short-cut. 단일 쿼리에는 적절하지만 트랜잭션 필요시 패턴 변경 필요.
- 한 INSERT 호출이 큰 트랜잭션 안에 묶이지 않음 — partial failure 시 idempotency를 호출자가 책임.

---

### Block 4/5 — Find & Recent API

```ts path=src/db/db.service.ts lines=157-200
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
```

**분석 / Analysis**

- **L157-178 `findDecisionEvent`**:
  - `!this._available → return null`: 미가용 시 silent null. 호출자가 메모리 폴백 처리.
  - `prepare(...).get(id)`: better-sqlite3는 `get`이 단일 row 또는 undefined.
  - 타입 단언 `as (Omit<...> & {...string}) | undefined`: row의 JSON 문자열 컬럼을 표현. **빈 문자열 처리 주의**: `r.matched_rules`가 `""`면 `JSON.parse('')` → SyntaxError. 현재 스키마 default가 `'[]'`라 빈 문자열은 안 들어가지만, 외부 도구로 직접 데이터 삽입 시 위험.
  - 흔한 실수: `r.matched_rules ? JSON.parse(...) : []` 가드가 `''`는 falsy로 잘 걸리지만, `'null'` 같은 문자열은 truthy로 JSON.parse → `null` 반환 → 후속 코드가 `.map`/`.length`로 깨질 수 있음. 현재 사용처가 컨트롤러 응답뿐이라 위험 낮음.
- **L173-177 postgres find**:
  - generic `query<DecisionEventRow>`로 row 타입 캐스팅 — 런타임 검증 없음.
  - `res.rows[0] ?? null`: 표준 패턴.
- **L180-200 `recentDecisionEvents`**:
  - `limit` 매개변수: 컨트롤러에서 `Math.min(Number(limit), 1000)` 후 전달. NaN이면 SQL LIMIT NaN → pg error.
    - 흔한 실수: SQLite는 LIMIT NaN을 어떻게 처리? `LIMIT ?` placeholder에 JS `NaN` 바인딩 시 better-sqlite3가 TypeError 가능. 컨트롤러에서 가드 필요.
  - 정렬: `ORDER BY created_at DESC`. Postgres에선 인덱스 없으면 (tenant 미지정 시) full scan. README에 `idx_audit_domain_time` 인덱스만 언급되어 created_at 단독 인덱스 없음 → 큰 테이블에서 느려질 가능성.
  - 결과 가공: sqlite는 row마다 JSON.parse 2번 × N rows. limit 1000이면 2000회. 성능 영향 미미.
- 두 메서드 모두 트랜잭션/공유 connection 사용 안 함.

**짚어볼 점 / Watch-outs**
- `recentDecisionEvents`가 전체 테이블 스캔 가능 — multi-tenant 환경에서는 tenant 필터 인자 필요.
- JSON.parse 가드가 빈 문자열만 처리, malformed JSON은 throw.
- `created_at` 단독 인덱스 부재로 시계열 페이지네이션 비싸짐.

---

### Block 5/5 — Lifecycle teardown

```ts path=src/db/db.service.ts lines=202-206
  async onModuleDestroy(): Promise<void> {
    if (this.pg) await this.pg.end().catch(() => undefined);
    if (this.sqlite) this.sqlite.close();
  }
}
```

**분석 / Analysis**

- **L202-205 `onModuleDestroy`**:
  - `this.pg.end()`: 풀 종료. **`.catch(() => undefined)`**로 종료 오류 swallow — graceful shutdown에서 stack을 흘리지 않으려는 의도. 그러나 connection이 활성 쿼리 중일 때 end()는 모든 쿼리가 완료될 때까지 기다림. 강제 종료 필요하면 `pg.Pool#end({ idleTimeoutMillis: 0 })` 등의 옵션 또는 timeout wrap이 필요.
  - `this.sqlite.close()`: 동기. WAL checkpoint 자동 수행. 활성 prepared statement는 닫혀야 하지만 이 facade는 statement를 캐싱하지 않으므로 안전.
  - 흔한 실수: `enableShutdownHooks()`가 SIGTERM에 의해 트리거되는데, Express HTTP 서버는 동일 hook에서 `app.close()` 호출 — 이 동안 진행 중인 INSERT가 있다면 race condition. 짧은 응답 시간(수 ms)이라 실용적 위험 낮음.

**짚어볼 점 / Watch-outs**
- pg.end() catch swallow가 디버깅 어렵게 함. 최소 log.warn 권장.
- sqlite.close() 실패는 대처 없음 (어차피 프로세스 종료).

---

## File-level Verdict

- **강점**
  1. 단일 facade로 SQLite/Postgres 지원 — 로컬 dev 친화적.
  2. SQL injection 안전 (prepared / placeholder 일관).
  3. Lifecycle hooks로 자원 정리 명시.
- **위험**
  1. **자동 재연결 없음** — DB 일시 장애 후 영구 fallback 모드.
  2. Postgres 기본 비밀번호 하드코딩.
  3. `DecisionEventRow.created_at: string`/`risk_score: number` 타입이 pg 실제 반환 타입과 불일치 (pg는 Date/string).
- **개선 권고**
  1. `setInterval`로 health-ping → DB 복구 감지 시 `_available=true`.
  2. `validate`/`required` 환경변수 검증 (`POSTGRES_PASSWORD` 누락 시 throw).
  3. `pg.types.setTypeParser`로 NUMERIC을 parseFloat, 또는 `decision_events.risk_score`를 DOUBLE PRECISION으로.
- **재읽기 권고 레벨**: High — 가장 위험 표면이 넓은 파일. 다음 라운드에서 동시성/재연결/타입 정합성 집중 검토 권장.
