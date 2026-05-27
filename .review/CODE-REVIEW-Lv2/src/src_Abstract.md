# `src/` Directory Abstract

## 역할
NestJS 애플리케이션 전체 소스 루트. 단일 패키지, 단일 배포 단위.

## 하위 디렉토리

| 경로 | 책임 | 핵심 파일 |
| :-- | :-- | :-- |
| `src/` (root) | bootstrap + AppModule | `main.ts`, `app.module.ts` |
| `src/db/` | Postgres/SQLite 듀얼 드라이버 facade | `db.service.ts` (206 LOC), `schema.sqlite.ts` |
| `src/events/` | HTTP 컨트롤러 + zod 검증 + 메모리 폴백 | `events.controller.ts`, `events.service.ts`, `events.types.ts` |
| `src/health/` | 헬스 프로브 | `health.controller.ts` |

## 모듈 그래프
- `AppModule` → `ConfigModule.forRoot({ isGlobal:true })`, `DbModule` (`@Global`), `EventsModule`
- `EventsModule` → `EventsController`, `EventsService`
- `EventsService` ← injects `DbService` (글로벌)
- `HealthController` ← injects `DbService`

## 데이터 흐름
HTTP(POST /events) → `EventsController.create` → `DecisionEventSchema.safeParse` → `EventsService.record` → (DB 가용?) → `DbService.insertDecisionEvent` → pg/sqlite.
폴백: `EventsService.memoryBuffer` (Array, 1000건 FIFO).

## 외부 결합
- `pg` (운영 DB)
- `better-sqlite3` (동기, dynamic import — 빌드 시 native 의존)
- `zod` (입력 스키마)
- `@nestjs/*` (DI/HTTP)

## 진입점 거리
| 파일 | distance from `main.ts` |
| :-- | --: |
| `app.module.ts` | 1 |
| `db/db.module.ts` | 2 |
| `db/db.service.ts` | 3 |
| `events/events.module.ts` | 2 |
| `events/events.controller.ts` | 3 |
| `events/events.service.ts` | 4 |
| `events/events.types.ts` | 4 |
| `db/schema.sqlite.ts` | 4 |
| `health/health.controller.ts` | 2 |

세부 라인 리뷰는 각 `.md` 참조.
