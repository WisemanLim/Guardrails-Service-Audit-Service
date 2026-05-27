# `src/events/events.module.ts` — Level 2 Review

## Pre-Review Header
- 역할: `EventsController` + `EventsService` 묶음 모듈, 서비스 export
- 진입점에서의 거리: 2
- 라인 수: 6
- 주요 export: `EventsModule`
- 의존 모듈 (internal): `./events.controller`, `./events.service`
- 사용된 외부 패키지: `@nestjs/common`
- 부수효과: 없음
- 동시성 모델: N/A
- 테스트 커버리지 흔적: 없음

## Source & Analysis

```ts path=src/events/events.module.ts lines=1-6
import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({ controllers: [EventsController], providers: [EventsService], exports: [EventsService] })
export class EventsModule {}
```

**분석 / Analysis (Level 2)**

- **L1-3 imports**: 필요한 3 토큰만.
- **L5 `@Module(...)`**:
  - `controllers: [EventsController]` — Nest가 `/events` 라우트 등록.
  - `providers: [EventsService]` — DI 컨테이너에 싱글톤 등록.
  - `exports: [EventsService]` — 외부 모듈이 사용할 수 있게 노출. 현재 외부 사용자는 없음(`AppModule`만 imports). 미래에 webhook 모듈/anomaly detector 모듈 등이 이 서비스를 직접 호출할 가능성 대비.
    - 흔한 실수: exports에 누락하면 다른 모듈에서 inject 시 `Nest can't resolve dependencies` 에러. 현재 패턴은 안전.
- **L6 빈 클래스**: 표준.

**짚어볼 점 / Watch-outs**
- `DbModule`이 `@Global()`이라 명시 imports 불필요. 의도된 단축.

## File-level Verdict

- **강점**
  1. 최소 구성, 표준 Nest 패턴.
- **위험**
  - 없음.
- **개선 권고**
  - 외부 모듈이 EventsService를 사용하지 않게 된다면 exports 제거하여 캡슐화 강화.
- **재읽기 권고 레벨**: Skip.
