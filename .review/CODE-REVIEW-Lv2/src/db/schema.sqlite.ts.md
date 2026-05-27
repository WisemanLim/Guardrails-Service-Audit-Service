# `src/db/schema.sqlite.ts` — Level 2 Review

## Pre-Review Header
- 역할: SQLite 모드에서 사용할 `decision_events` 테이블 + 인덱스 DDL을 export
- 진입점에서의 거리: 4 (main → AppModule → DbModule → DbService → schema)
- 라인 수: 32
- 주요 export: `AUDIT_SQLITE_SCHEMA` (string)
- 의존 모듈 (internal): 없음
- 사용된 외부 패키지: 없음
- 부수효과: 없음 (정의만; 실행은 `DbService.openSqlite`에서)
- 동시성 모델: N/A
- 테스트 커버리지 흔적: 없음

## Source & Analysis

```ts path=src/db/schema.sqlite.ts lines=1-32
/**
 * SQLite schema for the Audit Service (local / lightweight ops).
 *
 * Differences from the Postgres schema:
 *   - TEXT[] columns → TEXT (JSON-encoded array)
 *   - BYTEA → BLOB
 *   - TIMESTAMPTZ → TEXT (ISO 8601 via datetime('now'))
 *   - gen_random_uuid() → UUID generated in Node
 *   - NUMERIC → REAL
 */
export const AUDIT_SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS decision_events (
  decision_id    TEXT PRIMARY KEY,
  tenant_id      TEXT,
  session_id     TEXT,
  domain         TEXT NOT NULL,
  locale         TEXT NOT NULL,
  io_type        TEXT NOT NULL,
  text_hash      TEXT NOT NULL,
  text_encrypted BLOB,
  decision       TEXT NOT NULL,
  risk_score     REAL NOT NULL DEFAULT 0,
  matched_rules  TEXT NOT NULL DEFAULT '[]',
  categories     TEXT NOT NULL DEFAULT '[]',
  policy_version TEXT,
  latency_ms     INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON decision_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_domain_time ON decision_events(domain, created_at DESC);
`;
```

**분석 / Analysis (Level 2)**

- **L1-10 주석**: Postgres↔SQLite 매핑을 명문화. 향후 다른 SQLite 스키마 추가 시 가이드. 잘 작성됨.
- **L11 export const ... = `...`**: 멀티라인 템플릿 리터럴. `Database.exec`는 여러 statement를 세미콜론으로 분리해 실행 가능.
- **L12 `CREATE TABLE IF NOT EXISTS`**: idempotent. 컬럼 추가/변경은 자동 마이그레이션되지 않음 — 운영 schema drift 위험.
  - 흔한 실수: 후속 컬럼 추가 시 별도 `ALTER TABLE`을 코드 안에 두지 않으면 새 코드 + 기존 DB에서 컬럼 missing. 마이그레이션 도구(knex/drizzle) 부재.
- **L13 `decision_id TEXT PRIMARY KEY`**: SQLite는 UUID 타입 없음 → TEXT 저장. 정렬/조회 성능은 PRIMARY KEY 인덱스에서 충분.
- **L14-16 nullable 필드**: `tenant_id`, `session_id`는 NULL 허용. zod 스키마와 일치.
- **L17-19 NOT NULL TEXT**: domain/locale/io_type 필수.
- **L20 `text_hash TEXT NOT NULL`**: SHA-256 hex (64자) 또는 다른 해시 형식. 길이 제약 없음.
- **L21 `text_encrypted BLOB`**: AES-256 ciphertext 위치 — 현재 코드에서 미사용 (insertDecisionEvent에 컬럼 누락). 컬럼만 예약된 상태.
  - 흔한 실수: 미래의 INSERT 코드에서 컬럼이 정의에 없으면 NULL로 들어가는데, postgres와 sqlite의 NULL 처리는 동일. OK.
- **L22 `decision TEXT NOT NULL`**: enum 미강제. zod에서도 자유 문자열. README는 `"allow"|"warn"|"redact"|"block"` 같은 값 시사 — DB 레벨 CHECK 없음.
- **L23 `risk_score REAL NOT NULL DEFAULT 0`**: SQLite의 REAL은 8-byte IEEE float. Postgres NUMERIC과 달리 정밀도 손실 가능 (0.1 + 0.2 != 0.3). risk_score는 0..1 범위라서 실용적 영향 낮음.
- **L24-25 `matched_rules TEXT NOT NULL DEFAULT '[]'`**: JSON-encoded array. `JSON.parse('[]') = []`로 항상 안전. 빈 문자열 들어갈 일 없음(DEFAULT 보장).
- **L26 `policy_version TEXT`**: nullable.
- **L27 `latency_ms INTEGER`**: nullable, integer.
- **L28 `created_at TEXT NOT NULL DEFAULT (datetime('now'))`**: SQLite의 `datetime('now')`는 **UTC** 기준 ISO-like 문자열 (`'2026-05-20 12:34:56'`, T/Z 없음). Postgres `TIMESTAMPTZ`와 형식 다름.
  - 흔한 실수: 클라이언트가 `new Date(row.created_at)` 호출 시 SQLite의 `'YYYY-MM-DD HH:MM:SS'`는 일부 환경에서 invalid date로 해석될 수 있음 (브라우저). Node `Date`는 허용. JSON 직렬화에서도 이 string 그대로 전달됨.
  - 권장: `strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`로 ISO-8601 + Z 추가.
- **L31-32 인덱스**:
  - `(tenant_id, created_at DESC)`: 멀티테넌트 페이지네이션 패턴 — 표준.
  - `(domain, created_at DESC)`: domain별 조회.
  - **누락 인덱스**: `(created_at DESC)` 단독. `recentDecisionEvents`가 tenant/domain 필터 없이 호출되면 인덱스 미사용 풀스캔.
  - `decision_id`은 PRIMARY KEY로 자동 인덱스.

**짚어볼 점 / Watch-outs**
- 스키마는 정의만 있고 마이그레이션 도구 부재.
- `text_encrypted` 컬럼 예약 — 사용처 코드 없어서 dead column.
- `created_at` 포맷 차이가 클라이언트 호환성에 영향 가능.
- decision 같은 enum성 컬럼에 CHECK 제약 없음.

## File-level Verdict

- **강점**
  1. Postgres와의 차이를 주석으로 명확히 명시.
  2. idempotent `IF NOT EXISTS` 사용.
  3. JSON-array 인코딩 default `'[]'`로 parser 안전성 확보.
- **위험**
  1. 마이그레이션 도구 부재 — 컬럼 추가 시 기존 DB 수동 ALTER 필요.
  2. `created_at` 포맷이 ISO-8601 미준수.
  3. `recentDecisionEvents` no-filter 경로 인덱스 부재.
- **개선 권고**
  1. `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` 적용.
  2. `CREATE INDEX idx_audit_time ON decision_events(created_at DESC)` 추가.
  3. drizzle/knex 기반 migration 도입 또는 schema 버전 컬럼.
- **재읽기 권고 레벨**: Low — 안정적이고 작은 파일. 컬럼 추가 시 재검토.
