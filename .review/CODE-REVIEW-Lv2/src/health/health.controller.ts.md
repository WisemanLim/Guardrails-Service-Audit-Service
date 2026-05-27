# `src/health/health.controller.ts` — Level 2 Review

## Pre-Review Header
- 역할: `GET /health` — 서비스 상태 + DB 드라이버/가용성 노출
- 진입점에서의 거리: 2
- 라인 수: 11
- 주요 export: `HealthController`
- 의존 모듈 (internal): `../db/db.service`
- 사용된 외부 패키지: `@nestjs/common`
- 부수효과: 없음 (read-only)
- 동시성 모델: 동기 응답
- 테스트 커버리지 흔적: 없음

## Source & Analysis

```ts path=src/health/health.controller.ts lines=1-11
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
```

**분석 / Analysis (Level 2)**

- **L1-2 imports**: Nest 데코레이터 + DB facade.
- **L4 `@Controller('health')`**: prefix `/health`. AppModule이 직접 등록 (HealthModule 없음).
- **L5-6 constructor**: DI로 DbService 주입. `@Global() DbModule` 덕분.
- **L7-9 `health()`**:
  - GET handler. async 아님 — 호출은 동기.
  - 응답: `{ status: 'ok', db: { driver, available } }`.
    - `status` 하드코딩 `'ok'`. **DB 미가용에도 `'ok'`** — readiness 신호로 부적합.
    - `driver`: `'postgres' | 'sqlite'` — public readonly 필드 직접 노출. 운영 정보 노출 (정보 공개 leak이라기엔 낮은 민감도).
    - `available`: 실제 DB 가용 boolean.
  - 흔한 실수: k8s liveness/readiness 분리:
    - liveness: 프로세스 자체가 살아있는지(`status:'ok'`).
    - readiness: 트래픽 수신 가능 여부(`db.available` 필요).
    - 현재 단일 엔드포인트로 두 신호 혼재 — orchestrator가 `db.available` 검사하지 않으면 fallback 모드에 트래픽 계속 흘러감.
- **L10-11 close**.

**짚어볼 점 / Watch-outs**
- HTTP 상태코드는 항상 200. `db.available=false`라도 200. health probe가 status code만 보면 fallback 모드를 못 잡음.
- 인증 없음. 외부 노출 시 정보 공개 (driver 이름).
- `latency` 측정값 부재 — DB ping 실측 없음.

## File-level Verdict

- **강점**
  1. 매우 작고 의도가 명확.
  2. `available` 필드로 모니터링 가능 (운영자가 검사 시).
- **위험**
  1. liveness/readiness 분리 부재 — fallback 모드에 트래픽 유입 위험.
  2. DB 미가용에도 HTTP 200 응답.
- **개선 권고**
  1. `/health/live`(항상 ok)와 `/health/ready`(db.available에 따라 503) 분리.
  2. 또는 단일 엔드포인트에서 `db.available=false` 시 `HttpException(..., 503)` throw.
  3. (선택) `pingMs` 추가 — 실제 SELECT 1 측정.
- **재읽기 권고 레벨**: Medium — 운영 배포 전에 반드시 정비.
