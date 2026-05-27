# tsconfig.json — 코드 리뷰
> 리뷰 레벨: 2
> [← INDEX.md](./INDEX.md)

**파일 요약**
- 역할: TypeScript 컴파일 옵션. CommonJS, ES2022, strict.
- 진입점 거리: -1 (build config)
- LOC: 20
- export: N/A
- 의존 모듈: TypeScript compiler
- 외부 패키지: `typescript` ^5.4.0
- 부수효과: 빌드 시 `./dist`로 emit + sourceMap
- 동시성: N/A
- 테스트 커버리지: N/A

```json path=tsconfig.json lines=1-20
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strict": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.spec.ts"]
}
```

**분석 / Analysis (Level 2)**

- **`module: commonjs`** + **`moduleResolution: node`**: Nest 10의 기본. Node 20에서 CJS 동작. ESM 전환 시 dynamic import 부분(`db.service.ts`의 `await import('better-sqlite3')`)이 그대로 동작하지만, top-level `import` 문은 변경 필요.
- **`target: ES2022`** + **`lib: ["ES2022"]`**: Node 20이 ES2022 전부 지원. `Object.hasOwn` 등 사용 가능. lib에 `DOM` 미포함 → Node 환경 적합.
- **`esModuleInterop: true`**: `import pg from 'pg'` 같은 default-import 친화. `db.service.ts`에서 `import { Pool } from 'pg'`로 named import만 쓰므로 영향 미미.
- **`experimentalDecorators` + `emitDecoratorMetadata`**: Nest DI의 필수 조합. 누락 시 `Cannot read properties of undefined (reading 'design:paramtypes')`.
- **`strict: true`**: `strictNullChecks` 포함 7가지 sub-flag 활성. `db.service.ts`에서 `?? null` 패턴이 빈번한 이유. 좋은 위생.
- **`resolveJsonModule: true`**: JSON import 허용. 현 소스에선 사용 안 함. 부담 0.
- **`skipLibCheck: true`**: 빌드 속도/CI 안정 위해 흔히 켬. **`@types/*` 충돌 시 silent로 넘어가는 위험** — 두 패키지가 같은 전역 타입을 다르게 선언하면 런타임에서야 발견.
- **`outDir: ./dist`**: `nest-cli.json#deleteOutDir=true`로 매 빌드 전 청소. `.gitignore`에 `dist` 포함 가정(본 리뷰 범위 외).
- **`baseUrl: "./"`**: 절대경로 import 허용. **paths 매핑이 없으므로 효과적으로 무의미** — 모든 import가 상대경로. 흔한 실수는 baseUrl만 두고 paths를 잊어 절대경로가 의도와 다르게 해석되는 것 (여기는 사용 안 하므로 무해).
- **`incremental: true`**: `.tsbuildinfo` 생성. CI에서 캐시 활용 가능. Dockerfile은 캐시 활용 안 함 (`deleteOutDir`이 dist만 지우므로 `.tsbuildinfo`가 dist에 있으면 사라짐).
- **`sourceMap: true`**: dist에 `.map` 동봉. 운영 이미지에 sourcemap 포함은 디버깅에는 좋지만 **이미지 크기 + 코드 노출**. NODE_ENV=production에서 stack trace에 원본 경로 노출되는 게 의도되는지 확인.
- **`include: src/**/*`** / **`exclude: spec.ts`**: 운영 빌드에서 테스트 제외. 합리적.

**짚어볼 점**
- **`noUnusedLocals` / `noUnusedParameters` / `noImplicitReturns` 비활성**: strict가 잡지 않는 정적 분석 영역. 권고: 추가하여 죽은 코드 검출.
- **`noUncheckedIndexedAccess` 비활성**: `arr[i]`가 `T | undefined`로 추론되지 않아 메모리 버퍼 `find` 결과 등에서 잠재적 `undefined` 누락 가능.
- **`forceConsistentCasingInFileNames` 미선언**: macOS dev에서 통과한 import가 Linux CI에서 깨질 수 있음.
- **`sourceMap` + 운영 이미지**: 보안 정책 확인 필요.
- secrets/PII/eval 등 manifest 레벨에서 N/A.

**파일 수준 평가**
- 강점:
  1. `strict: true` 기본 켜짐 — 가장 큰 안전망.
  2. Nest 데코레이터 메타데이터 정확히 설정.
  3. ES2022 + Node 20 일관성.
- 위험:
  1. `skipLibCheck`로 타입 충돌 침묵.
  2. `noUnusedLocals`/`noUncheckedIndexedAccess` 등 보조 안전망 부재.
  3. `forceConsistentCasingInFileNames` 부재 → 크로스플랫폼 함정.
- 개선 권고:
  1. `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`, `noUncheckedIndexedAccess` 추가.
  2. 운영 이미지에서 sourceMap 제외 또는 별도 빌드 프로파일.
  3. `tsBuildInfoFile`을 dist 외부로 옮겨 `deleteOutDir`로 사라지지 않게.
- 재읽기 권고 레벨: 1
- 이유: 표준 Nest 템플릿에 가까우며 추가 위험은 위 권고로 해소 가능.

[← INDEX.md](./INDEX.md) | 관련: `package.json.md`, `nest-cli.json.md`
