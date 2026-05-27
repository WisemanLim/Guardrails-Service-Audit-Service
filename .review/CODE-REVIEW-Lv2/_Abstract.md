# Audit Service — Root Abstract

## 한 줄 요약
NestJS 10 기반의 단일 책임 마이크로서비스 — MCP Guardrails의 모든 판정 결과를 Postgres(운영) 또는 SQLite(로컬)에 immutable log로 적재하고 `decisionId` 기반 조회를 제공한다.

## 구성
- **진입점**: `src/main.ts` → `0.0.0.0:8083`
- **라우트**: `/health` (1), `/events` (POST/GET), `/events/:id` (GET) — 총 4개 핸들러
- **모듈**: `AppModule` ⊃ `ConfigModule(global)` + `DbModule(@Global)` + `EventsModule` + `HealthController`
- **저장소**: env `DB_DRIVER=sqlite|postgres` 분기. 미가용 시 메모리 ring buffer(1000건) 폴백.

## 코드 크기
- 10개 TS 파일, 약 383 LOC. 가장 큰 파일 `db/db.service.ts` (206 LOC).
- 테스트 `.spec.ts` 0개 (jest 설정만 존재).

## 강점
1. 매우 작고 응집도 높음 — 책임이 "decision_events 적재/조회"로 좁게 한정.
2. Driver-neutral facade로 로컬 dev/CI에서 Postgres 없이 기동 가능.
3. Zod 검증을 컨트롤러 경계에서 일관 적용.

## 주의점
1. DB unavailable 시 in-memory 폴백이 drain되지 않아 데이터 유실 가능 (recovery 미구현).
2. 헬스체크가 DB 상태와 무관하게 항상 200 → readiness 신호로 부적합.
3. Postgres 기본 비번 하드코딩, 입력 limit/Port 파싱이 NaN-safe 아님, lockfile 부재.

세부 사항: `INDEX.md` §4 / 각 파일 리뷰 참조.
