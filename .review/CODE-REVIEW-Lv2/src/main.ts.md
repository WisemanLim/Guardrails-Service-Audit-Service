# `src/main.ts` — Level 2 Review

## Pre-Review Header
- 역할: Nest 애플리케이션 부트스트랩, HTTP 리스닝 시작
- 진입점에서의 거리: 0 (entrypoint)
- 라인 수: 12
- 주요 export: `bootstrap` (호출형 IIFE 패턴, default export 없음)
- 의존 모듈 (internal): `./app.module`
- 사용된 외부 패키지: `@nestjs/core` (NestFactory), `@nestjs/common` (Logger)
- 부수효과: HTTP 포트 바인딩, OS signal handler 등록 (`enableShutdownHooks`)
- 동시성 모델: 단일 Node 이벤트 루프, top-level `async` IIFE
- 테스트 커버리지 흔적: 없음

## Source & Analysis

```ts path=src/main.ts lines=1-12
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 8083);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`Audit Service listening on :${port}`);
}
bootstrap();
```

**분석 / Analysis (Level 2)**

- **L1-3 imports**: 표준 Nest 부트스트랩 셋업. `Logger`는 Nest 자체의 컨소솔 로거이며 `WinstonModule` 등 외부 로거 미사용. `'./app.module'` 상대 경로 — CommonJS 모듈로 컴파일됨 (tsconfig `module=commonjs`).
- **L5 `async function bootstrap`**: Nest 권장 패턴. 함수명을 `bootstrap`으로 유지하면 디버거/프로파일러에서 진입 스택 추적이 쉬움.
- **L6 `NestFactory.create(AppModule)`**: 기본 어댑터(`@nestjs/platform-express`)를 사용. CORS·HTTPS·Body limit 등 모두 기본값.
  - 흔한 실수: 운영에서 `app.useGlobalPipes(new ValidationPipe(...))` 없이 zod 검증을 컨트롤러에서만 사용하는 경우, 다른 컨트롤러 추가 시 검증 빠뜨리기 쉽다.
- **L7 `enableShutdownHooks`**: `SIGTERM`/`SIGINT`에 OnModuleDestroy 트리거. `DbService.onModuleDestroy`(pool.end / sqlite.close)와 연결됨 — 컨테이너 graceful shutdown에 필수.
- **L8 `Number(process.env.PORT ?? 8083)`**:
  - `process.env.PORT`는 항상 `string | undefined`. `??`로 undefined일 때 8083 사용.
  - **함정**: `PORT="abc"` 같은 잘못된 값이면 `Number("abc") === NaN`. `app.listen(NaN, ...)` → Node 내부에서 `ERR_SOCKET_BAD_PORT` throw, 부팅 실패하지만 에러 로그가 모호함.
  - 권장: `const port = Number(process.env.PORT); const finalPort = Number.isFinite(port) ? port : 8083;` 또는 zod 검증.
- **L9 `app.listen(port, '0.0.0.0')`**: 외부 인터페이스 노출. 컨테이너 안에서는 필수지만, 로컬 dev 호스트에서 실수로 외부 노출될 수 있음.
- **L10 `new Logger('Bootstrap').log(...)`**: 컨텍스트 문자열 패턴. 일반적으로 클래스 멤버 `private readonly log = new Logger(...)`로 캐싱하지만 부트스트랩 1회성이라 OK.
- **L12 `bootstrap()`**: 반환값 비-await 호출 — `bootstrap()`이 reject 되면 unhandledRejection. Node 20부터 기본적으로 프로세스 종료(`--unhandled-rejections=throw` 기본)되므로 실용적 영향은 적지만, `.catch((e)=>{ logger.error(e); process.exit(1); })`가 더 명시적.

**짚어볼 점 / Watch-outs**
- `body-parser` 한도 미설정 — 기본값(100kb)이지만 큰 페이로드 대응 필요 시 명시.
- `helmet`, CORS 미설정. Audit Service는 사내 통신이지만 zero-trust면 추가.
- `app.useGlobalPipes` / `app.useGlobalFilters` 없음. 예외 직렬화는 Nest 기본 필터에 의존.

## File-level Verdict

- **강점**
  1. 매우 간결 — 부트스트랩은 12라인.
  2. `enableShutdownHooks`로 OnModuleDestroy 체인 연결.
- **위험**
  1. PORT NaN-unsafe — 잘못된 env 시 부팅 실패의 원인 추적 어려움.
  2. `bootstrap()` 미 awaited 최상위 호출 — reject 핸들링 명시 없음.
- **개선 권고**
  1. PORT 파싱을 `Number.isFinite` 가드.
  2. `bootstrap().catch(...)` 추가하고 명시적 `process.exit(1)`.
- **재읽기 권고 레벨**: Low — 변경 시(예: CORS/리스너 옵션 추가) 다시.
