# nest-cli.json — 코드 리뷰
> 리뷰 레벨: 2
> [← INDEX.md](./INDEX.md)

**파일 요약**
- 역할: `@nestjs/cli` 설정. sourceRoot, build 옵션.
- 진입점 거리: -1
- LOC: 6
- export: N/A
- 의존 모듈: `@nestjs/cli`, `@nestjs/schematics`
- 외부 패키지: 위 + JSON schema validator (`json.schemastore.org`)
- 부수효과: `nest build` 시 `dist/` 삭제 후 재생성
- 동시성: N/A
- 테스트 커버리지: N/A

```json path=nest-cli.json lines=1-6
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true }
}
```

**분석 / Analysis (Level 2)**

- **`$schema`**: JSON schema 자동 완성/검증 (에디터). 런타임 영향 없음. 좋은 위생.
- **`collection: @nestjs/schematics`**: `nest generate` 명령이 사용할 스키매틱 컬렉션. devDeps에 설치되어 있음. 영향 없음 (코드젠에만 쓰임).
- **`sourceRoot: src`**: `nest build` 가 `src` 기준으로 컴파일. `tsconfig.json#include: src/**/*`와 정합.
- **`compilerOptions.deleteOutDir: true`**: 매 빌드 전 `dist/` 비움. 잔존 산출물 제거로 stale 파일 위험 차단. **tsconfig의 `incremental: true`로 생성되는 `.tsbuildinfo`가 dist 안에 있으면 함께 삭제되어 incremental 효과가 사라짐** — 보통 무해하나 의도 확인 권고.
- nest-cli.json에서 활용 가능한 옵션 미사용:
  - `assets`: 정적 파일 dist에 복사 (현재 정적 파일 없음 — 불필요).
  - `webpack`: webpack 빌드 (Nest 10 기본은 tsc).
  - `entryFile`: 기본 `main`. dist의 진입 파일명. `package.json#main = dist/main.js`와 정합.
  - `monorepo`/`projects`: 단일 패키지이므로 불필요.

**짚어볼 점**
- nest-cli.json은 단순한 manifest로 보안/PII 위험 없음.
- 흔한 실수: `sourceRoot`를 옮기고 `tsconfig#include`를 잊어 빌드 산출물이 비는 경우 — 본 파일은 정합.
- `deleteOutDir`이 incremental과 충돌하는지 한 번은 측정 권고.

**파일 수준 평가**
- 강점:
  1. 최소 설정으로 표준 Nest 동작 보장.
  2. `$schema`로 에디터 친화.
  3. `deleteOutDir`로 stale 산출물 차단.
- 위험:
  1. incremental + deleteOutDir 잠재 충돌 (성능, 정상성 아님).
  2. (없음) 그 외 표준 범위.
- 개선 권고:
  1. CI 캐시 활용 시 `.tsbuildinfo` 위치를 dist 외부로 빼고 `deleteOutDir` 유지.
  2. 정적 자산이 생기면 `assets` 항목 추가.
  3. 변경 빈도가 낮으니 그대로 두는 것도 합리적.
- 재읽기 권고 레벨: 0–1
- 이유: 표준 minimal config. 추가 분석 가치 낮음.

[← INDEX.md](./INDEX.md) | 관련: `package.json.md`, `tsconfig.json.md`
