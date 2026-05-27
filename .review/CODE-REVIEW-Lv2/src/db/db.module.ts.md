# `src/db/db.module.ts` — Level 2 Review

## Pre-Review Header
- 역할: `DbService`를 전역으로 export하는 NestJS 모듈 컨테이너
- 진입점에서의 거리: 2
- 라인 수: 6
- 주요 export: `DbModule`
- 의존 모듈 (internal): `./db.service`
- 사용된 외부 패키지: `@nestjs/common` (Global, Module)
- 부수효과: 없음 (메타데이터 등록)
- 동시성 모델: N/A
- 테스트 커버리지 흔적: 없음

## Source & Analysis

```ts path=src/db/db.module.ts lines=1-6
import { Global, Module } from '@nestjs/common';
import { DbService } from './db.service';

@Global()
@Module({ providers: [DbService], exports: [DbService] })
export class DbModule {}
```

**분석 / Analysis (Level 2)**

- **L1-2 imports**: `Global` 데코레이터로 모듈을 글로벌화. `DbService`는 같은 디렉토리.
- **L4 `@Global()`**: 이 모듈을 한 번만 임포트하면 모든 모듈에서 `DbService` 주입 가능. `EventsModule`이 `DbModule`을 imports 배열에 명시하지 않아도 `EventsService.constructor(private db: DbService)`가 동작하는 이유.
  - 흔한 실수: 글로벌 모듈을 두 곳에서 임포트하면 Nest는 두 번째 임포트를 무시하지만 의존성 중복으로 보이게 됨. AppModule에서 한 번만 imports에 두는 현재 구성이 정답.
- **L5 `@Module({ providers, exports })`**: 동일한 클래스를 providers와 exports에 둠 — 클래스를 토큰으로 사용하는 표준 패턴. `useFactory`/`useValue` 없음.
- **L6 `export class DbModule {}`**: 비어있음.

**짚어볼 점 / Watch-outs**
- 글로벌 모듈은 가시성을 떨어뜨림. 의존성 그래프가 커지면 디버깅 어려움. Audit-Service 규모에서는 무방.
- 테스트 시 `DbModule`을 `Test.createTestingModule({ imports: [DbModule] })`로 가져오면 실제 DB 연결 시도하므로 spec에서는 provider override 필요.

## File-level Verdict

- **강점**
  1. 최소 구성. Boilerplate 외 노이즈 없음.
- **위험**
  - 없음 (이 파일 단독으로는).
- **개선 권고**
  - 테스트 추가 시 `DbModule.forRoot({ driver: 'sqlite' })` 같은 정적 팩토리로 환경 분리 고려.
- **재읽기 권고 레벨**: Skip — 거의 변경되지 않을 컴포넌트.
