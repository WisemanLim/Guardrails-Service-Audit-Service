# `src/db/` Directory Abstract

## 역할
Postgres ↔ SQLite 듀얼 드라이버 facade. 환경변수 `DB_DRIVER`로 분기하여 동일 인터페이스(`insertDecisionEvent`, `findDecisionEvent`, `recentDecisionEvents`)를 노출. `@Global()`로 전역 export.

## 구성
| 파일 | LOC | 역할 |
| :-- | --: | :-- |
| `db.module.ts` | 6 | @Global, DbService 등록/export |
| `db.service.ts` | 206 | Pool/Database 양방향 구현, lifecycle hooks |
| `schema.sqlite.ts` | 32 | SQLite DDL 상수 (BLOB·JSON-TEXT 매핑) |

## 듀얼 드라이버 동작
- `DB_DRIVER=postgres` (기본): `pg.Pool` (env: `POSTGRES_HOST/PORT/DB/USER/PASSWORD/SSL`)
- `DB_DRIVER=sqlite`: `better-sqlite3` 동적 import, 파일 `./var/audit.db`
- 어느 쪽도 가용하지 않으면 `EventsService`가 메모리 폴백으로 라우팅.

## 외부 결합
- `pg` ^8.11.5 (Postgres)
- `better-sqlite3` ^11.0.0 (SQLite, native build)
- `@nestjs/common` (DI, Logger, lifecycle)

## 진입점 거리
| 파일 | distance |
| :-- | --: |
| `db.module.ts` | 2 |
| `db.service.ts` | 3 (EventsService) / 3 (HealthController) |
| `schema.sqlite.ts` | 4 (db.service에서 import) |

## 강점
1. 단일 facade — 호출자(EventsService/HealthController) 코드 변경 없이 드라이버 전환.
2. 0-config 로컬 개발 가능 (SQLite 파일 자동 생성).
3. Lifecycle hooks(`onModuleInit`/`onModuleDestroy`)로 풀 정리.

## 주의점
1. **PG 기본 비밀번호 하드코딩** (`'guardrails'`) — env 누락 시 약한 자격증명으로 접속 시도.
2. **두 드라이버에 SQL 중복** — 컬럼 추가 시 두 분기 모두 수정. 컴파일러가 누락 검출 불가.
3. **SQLite는 BLOB/JSON-TEXT, PG는 BYTEA/JSONB** — text_encrypted 처리 시 round-trip 차이.
4. **driver 필드가 public** — HealthController가 직접 읽음. 캡슐화 누수.
5. **실측 ping 없는 isAvailable()** (구현 상세 — db.service.ts.md 참조).

## 권고
- env 검증 (zod-config 또는 Nest ConfigService validator).
- DDL/SQL을 한 곳에 모으는 query builder 또는 적어도 const 분리.
- driver를 `getDriver(): string` 메서드로 캡슐화.

세부 라인 리뷰: 각 `*.ts.md`
