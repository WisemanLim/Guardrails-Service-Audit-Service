# package.json — 코드 리뷰
> 리뷰 레벨: 2
> [← INDEX.md](./INDEX.md)

**파일 요약**
- 역할: npm 패키지 manifest. 의존성 핀, 스크립트, jest 설정.
- 진입점 거리: -1 (manifest)
- LOC: 46
- export: N/A
- 의존 모듈: `@nestjs/*`, `pg`, `better-sqlite3`, `zod`, `reflect-metadata`, `rxjs`
- 외부 패키지: 위 + (dev) jest, ts-jest, typescript, @types/*
- 부수효과: N/A (선언적)
- 동시성: N/A
- 테스트 커버리지: jest 설정만 존재, `.spec.ts` 0개.

```json path=package.json lines=1-46
{
  "name": "guardrails-audit-service",
  "version": "0.1.0",
  "description": "Audit / decision-events store for the MCP Guardrails Service.",
  "private": true,
  "main": "dist/main.js",
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main.js",
    "lint": "eslint \"src/**/*.ts\"",
    "test": "jest"
  },
  "dependencies": {
    "@nestjs/common": "^10.3.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/platform-express": "^10.3.0",
    "better-sqlite3": "^11.0.0",
    "pg": "^8.11.5",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.1",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.3.0",
    "@nestjs/schematics": "^10.1.0",
    "@nestjs/testing": "^10.3.0",
    "@types/jest": "^29.5.12",
    "@types/better-sqlite3": "^7.6.10",
    "@types/node": "^20.11.0",
    "@types/pg": "^8.11.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.2",
    "ts-node": "^10.9.2",
    "typescript": "^5.4.0"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "testEnvironment": "node"
  }
}
```

**분석 / Analysis (Level 2)**

- **`"private": true`**: npm publish 차단. 내부 서비스이므로 적절. 흔한 실수는 publish 의도 없는 서비스가 `private`를 누락해 사고로 레지스트리에 올라가는 경우.
- **`"main": "dist/main.js"`**: Nest CLI build 산출물 위치와 일치. `tsconfig.json#outDir = ./dist`와 정합.
- **`scripts.build = "nest build"`**: `@nestjs/cli`가 dev에 있으므로 동작. `nest-cli.json#deleteOutDir=true`에 의해 매 빌드 직전 `dist/`가 비워짐 — 좋은 위생.
- **`scripts.start = "node dist/main.js"`**: 사전 빌드 필요. CI/CD에서 `build` 누락 시 ENOENT. Dockerfile은 build를 명시적으로 수행하므로 안전.
- **`scripts.test = "jest"`**: jest config는 inline. **그러나 `.spec.ts` 파일 0개**. lint/test 게이트가 사실상 무의미.
- **`scripts.lint = "eslint ..."`**: **`eslint`가 devDeps에 없음.** 호출 시 `command not found`. 명백한 누락.
- **dependencies — `@nestjs/*` ^10.3.0**: Nest 10 LTS 라인. Express 어댑터 명시.
- **`better-sqlite3` ^11.0.0**: 동기 API. Node 20 호환. Caret range는 prebuilt 바이너리 ABI 변경에 노출 — lockfile 부재와 결합 시 빌드가 어느 날 갑자기 source-build로 전환.
- **`pg` ^8.11.5**: SSL/connection pooling 표준. `db.service.ts`에서 Pool 사용. caret이 8.x 내에서 minor 업데이트 허용.
- **`zod` ^3.22.4**: API 안정. `events.types.ts`/컨트롤러에서 사용.
- **`rxjs` ^7.8.1**: Nest 내부 의존. **소스에서 직접 import 없음** — peer 만족용. caret이 RxJS 7.x 내에서 호환.
- **`reflect-metadata` ^0.2.0**: Nest 데코레이터 메타데이터. main.ts 임포트 없음(테스트 필요 — 보통 Nest가 자동 처리).
- **devDependencies**: `ts-node`는 nest CLI watch에서 사용. `@types/*` 일관. `@nestjs/testing`은 설치되어 있으나 미사용.
- **jest 블록**:
  - `rootDir: src` — 적절.
  - `testRegex: .*\.spec\.ts$` — 표준.
  - `transform`: ts-jest로 ts/js 모두 변환. js 변환은 보통 불필요(노드 ts-jest 24+는 ESM/CJS 차이 주의).
  - `testEnvironment: node` — 적절.
- **caret(^) 범위만 사용**: lockfile 없음 + caret = **빌드 결정성 0**. 동일 커밋이 시간에 따라 다른 의존 트리를 생성.

**짚어볼 점**
- **lockfile 부재**: `package-lock.json`이 저장소에 없음. supply chain 위험 + 재현 빌드 손상.
- **`lint` 스크립트가 정의되어 있으나 ESLint 의존성 누락**: dead command. CI에서 호출되지 않는 한 침묵하지만, 호출되면 즉시 깨짐.
- **`test` 스크립트가 사실상 noop**: spec 0개. Audit 서비스의 SLA(데이터 유실 0)와 부조화.
- **`@nestjs/testing` 미사용**: 설치는 됐으나 활용 0.
- **secrets/eval/SQL injection 등은 manifest 차원에서 N/A.** PII 처리(text_hash/text_encrypted)와의 결합도 manifest에서는 직접 노출되지 않음.

**파일 수준 평가**
- 강점:
  1. 의존성이 작고 명확 (서비스 단일 책임 반영).
  2. Nest 10 LTS + Node 20 LTS 조합으로 보안 패치 수령 가능.
  3. `private: true`로 사고 publish 방지.
- 위험:
  1. lockfile 부재 → 재현 빌드 불가.
  2. `lint` 스크립트가 dead.
  3. 테스트 인프라는 있으나 spec 0개.
- 개선 권고:
  1. `npm install` 후 `package-lock.json` 커밋 (그리고 Dockerfile을 `npm ci`로 변경).
  2. `eslint` + `@typescript-eslint/*`를 devDeps에 추가하거나 `lint` 스크립트 제거.
  3. 최소 3개 spec 추가 (events.controller, events.service, db.service).
- 재읽기 권고 레벨: 1
- 이유: manifest는 선언적이며 변동 시 diff로 즉시 감지 가능.

[← INDEX.md](./INDEX.md) | 관련: `Dockerfile.md`, `tsconfig.json.md`, `nest-cli.json.md`
