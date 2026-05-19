# Guardrails-Service-Audit-Service

LLM/RAG 가드레일의 **판정 결과 영속화** 계층. 모든 `validate_*` 결정 이벤트를 PostgreSQL에 immutable log로 저장하고, `decisionId` 기반 조회를 제공한다.

## 컴포넌트 책임

PRD §3.2 ④. 핵심 4가지:

1. **decision_events 적재** — 판정 1건당 1행
2. **원문은 해시(SHA-256) + 메타데이터만 보존** — 옵션으로 AES-256 암호화 원문 저장
3. **`decisionId`로 조회 API** — MCP `explain_decision` tool의 백엔드
4. **Anomaly hooks (예정)** — 동일 세션 반복 high-risk 알림

## 스택

- Node 20 + TypeScript 5.4
- NestJS 10
- pg (PostgreSQL 클라이언트, connection pool max=10)
- zod (event payload 검증)

## 디렉토리 구조

```
src/
├── main.ts
├── app.module.ts
├── db/
│   ├── db.module.ts
│   └── pg.service.ts                # 연결 실패 시 in-memory fallback
├── events/
│   ├── events.module.ts
│   ├── events.types.ts              # DecisionEventSchema (zod)
│   ├── events.service.ts            # INSERT + 조회
│   └── events.controller.ts         # POST /events, GET /events, /events/:id
└── health/health.controller.ts
```

## REST API

| 메서드 | 경로 | 설명 |
| :-- | :-- | :-- |
| GET | `/health` | 헬스 + DB 가용 여부 |
| POST | `/events` | 결정 이벤트 적재 (MCP Server가 호출) |
| GET | `/events?limit=100` | 최근 N건 (기본 100, 최대 1000) |
| GET | `/events/:id` | 단일 `decisionId` 조회 |

## 이벤트 스키마

`src/events/events.types.ts`:

```typescript
{
  decisionId?: uuid,          // 미제공 시 서버가 발급
  tenantId?: uuid,
  sessionId?: string,
  domain: string,             // "global" | "manufacturing-food" | ...
  locale: string,             // "ko-KR" | "en" | "ja-JP"
  ioType: "input" | "output" | "both",
  textHash: string,           // SHA-256 hex of original text
  decision: string,           // "allow" | "warn" | "redact" | "block" | ...
  riskScore: number,          // 0..1
  matchedRules: string[],     // ["PRIV_ID_KR_IN_001", ...]
  categories: string[],       // ["pii.national_id_kr", ...]
  policyVersion?: string,
  latencyMs?: number
}
```

응답: `{ decisionId: "<uuid>" }`

## PostgreSQL 테이블

`scripts/init-db.sql`에서 생성. 핵심 컬럼:

```sql
CREATE TABLE decision_events (
  decision_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID,
  session_id      TEXT,
  domain          TEXT NOT NULL,
  locale          TEXT NOT NULL,
  io_type         TEXT NOT NULL,
  text_hash       TEXT NOT NULL,
  text_encrypted  BYTEA,
  decision        TEXT NOT NULL,
  risk_score      NUMERIC NOT NULL DEFAULT 0,
  matched_rules   TEXT[] NOT NULL DEFAULT '{}',
  categories      TEXT[] NOT NULL DEFAULT '{}',
  policy_version  TEXT,
  latency_ms      INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant_time ON decision_events(tenant_id, created_at DESC);
CREATE INDEX idx_audit_domain_time ON decision_events(domain, created_at DESC);
```

## DB 미가용 Fallback

`PgService` ping 실패 시 `available=false`로 전환. `EventsService`는 in-memory ring buffer(1000건)로 폴백.

- 개발 편의 (Postgres 없이 단독 기동 가능)
- 운영 환경에서는 health check가 `db: false`를 노출하므로 모니터링에서 잡아냄

## 환경 변수

| 변수 | 기본 | 설명 |
| :-- | :-- | :-- |
| `PORT` | `8083` | |
| `POSTGRES_HOST` | `127.0.0.1` | |
| `POSTGRES_PORT` | `5432` | |
| `POSTGRES_DB` | `guardrails` | |
| `POSTGRES_USER` | `guardrails` | |
| `POSTGRES_PASSWORD` | `guardrails` | |
| `LOG_LEVEL` | `info` | |

## 로컬 개발

```bash
npm install
cp .env.example .env

# DB 없이 (in-memory fallback)
npm run start:dev

# 이벤트 기록 테스트
curl -X POST http://localhost:8083/events \
  -H 'Content-Type: application/json' \
  -d '{
    "domain":"global", "locale":"ko-KR", "ioType":"input",
    "textHash":"abc123", "decision":"block",
    "riskScore":0.98, "matchedRules":["PRIV_ID_KR_IN_001"],
    "categories":["pii.national_id_kr"]
  }'
```

## Docker

```bash
docker build -t guardrails-audit-service .
docker run --rm -p 8083:8083 \
  -e POSTGRES_HOST=host.docker.internal \
  guardrails-audit-service
```

## 보안 원칙

- **원문 비저장 기본** — `textHash`만 저장
- 원문 암호화 저장이 필요한 경우 `text_encrypted`에 AES-256(GCM)로 저장 (M3 추가 예정)
- TTL 90일 자동 삭제 정책은 cron job으로 분리 운영 (운영 컴포넌트 책임)
- Row-level security (PostgreSQL RLS) tenant 격리는 M4에서 적용

## 도메인 확장 영향도

**없음** — 이벤트 스키마는 도메인 무관. P1/P2/Pn 어떤 조합으로 배포해도 동일하게 동작.

## 향후 작업 (M2+)

- Redis Streams 기반 비동기 적재 (현재는 동기 INSERT)
- AES-256(GCM) 원문 암호화 + KMS 키 회전
- 이상치 탐지 (per-session/per-tenant high-risk burst)
- Anomaly webhook (Slack/Teams)
- GraphQL 조회 API
- 보존기간 정책 자동 적용 (TTL 삭제 워커)
- RLS + tenant scope
