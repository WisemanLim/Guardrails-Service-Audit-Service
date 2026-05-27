# `src/app.module.ts` — Level 2 Review

## Pre-Review Header
- 역할: 루트 Nest 모듈 — 글로벌 ConfigModule, DbModule, EventsModule 묶음 + HealthController 등록
- 진입점에서의 거리: 1
- 라인 수: 11
- 주요 export: `AppModule` 클래스
- 의존 모듈 (internal): `./health/health.controller`, `./events/events.module`, `./db/db.module`
- 사용된 외부 패키지: `@nestjs/common` (Module), `@nestjs/config` (ConfigModule)
- 부수효과: 데코레이터 메타데이터 등록 (Nest DI 컨테이너 부팅 시 사용)
- 동시성 모델: 컴파일-타임 메타데이터, 런타임 동시성 영향 없음
- 테스트 커버리지 흔적: 없음

## Source & Analysis

```ts path=src/app.module.ts lines=1-11
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { EventsModule } from './events/events.module';
import { DbModule } from './db/db.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule, EventsModule],
  controllers: [HealthController],
})
export class AppModule {}
```

**분석 / Analysis (Level 2)**

- **L1-5 imports**: NestJS 표준 모듈 묶기 + 자체 모듈 3개 + 1 컨트롤러.
- **L7-10 `@Module(...)`**:
  - `imports[0]`: `ConfigModule.forRoot({ isGlobal: true })` — `.env` 자동 로드. `isGlobal:true`로 모든 모듈이 `ConfigService` 주입 가능.
    - 흔한 실수: `ConfigModule`을 글로벌로 띄우고도 코드에서 `process.env`를 직접 읽으면 ConfigModule이 제공하는 `validationSchema`, `load`, `envFilePath` 같은 안전망을 활용하지 못함. 실제로 `db.service.ts`/`main.ts` 모두 `process.env` 직접 접근.
    - 권장: `ConfigModule.forRoot({ isGlobal:true, validationSchema: zodEnvSchema })` 또는 `validate` 콜백으로 부팅 시점 검증.
  - `imports[1] DbModule`: 자기 자신이 `@Global()` (db.module.ts 참조). 글로벌 임포트는 한 번만 필요.
  - `imports[2] EventsModule`: HTTP 라우트(`/events`) + 서비스 묶음 등록.
  - `controllers: [HealthController]`: `HealthController`는 모듈 소속 없이 루트에 직접 등록. 작은 컴포넌트에 적절하지만 추후 health 라우트가 늘면 `HealthModule`로 승격 권장.
- **L11 `export class AppModule {}`**: 비어있는 클래스 — Nest의 표준 패턴. `OnApplicationBootstrap` 같은 lifecycle을 여기 두면 전역 부팅 hook으로 활용 가능 (현재는 미사용).

**짚어볼 점 / Watch-outs**
- `ConfigService` 미사용으로 ConfigModule이 자동 .env 로더 역할만 함. 의도라면 명시적 주석 권장.
- `HealthController`를 모듈 그래프 밖에 두면 health-specific provider 주입 시 위치 어색해짐.

## File-level Verdict

- **강점**
  1. 모듈 그래프가 단순(3 imports, 1 컨트롤러)하여 가독성 우수.
  2. `@Global() DbModule` 활용으로 `EventsModule`이 명시 import 불필요.
- **위험**
  1. ConfigModule이 검증 없이 사용 — env 누락/오타가 런타임까지 끌려감.
- **개선 권고**
  1. `ConfigModule.forRoot({ validate: ... })` 또는 zod 기반 env 스키마 추가.
  2. Health 라우트 확장 시 `HealthModule` 분리.
- **재읽기 권고 레벨**: Low — 모듈 그래프 변경 시.
