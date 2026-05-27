# Dockerfile — 코드 리뷰
> 리뷰 레벨: 2
> [← INDEX.md](./INDEX.md)

**파일 요약**
- 역할: 멀티스테이지(builder→runtime) 컨테이너 이미지 정의. node:20-alpine 기반.
- 진입점 거리: -1 (배포 컨테이너 부트스트랩)
- LOC: 17
- export: N/A (Dockerfile)
- 의존 모듈: `node:20-alpine`, `apk` (alpine package manager)
- 외부 패키지: python3/make/g++ (better-sqlite3 native build 의존)
- 부수효과: `npm install`, `npm run build`, `mkdir -p /app/var`, EXPOSE 8083
- 동시성: N/A (build-time)
- 테스트 커버리지: 없음

```dockerfile path=Dockerfile lines=1-17
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json tsconfig.json nest-cli.json ./
RUN npm install --no-fund --no-audit
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
RUN mkdir -p /app/var
EXPOSE 8083
CMD ["node", "dist/main.js"]
```

**분석 / Analysis (Level 2)**

- **라인 1**: `FROM node:20-alpine AS builder` — 빌더 스테이지 이름 명명. Alpine은 musl libc 기반이라 `better-sqlite3` 네이티브 빌드가 필요하며, 그 때문에 라인 3에서 python3/make/g++을 설치한다. 자주 발견되는 실수는 Debian slim에서 정상이던 빌드가 Alpine에서 prebuilt 바이너리 부재로 실패하는 경우다.
- **라인 3**: `apk add --no-cache python3 make g++` — `--no-cache`로 인덱스를 디스크에 남기지 않음(이미지 크기 절감). better-sqlite3 11.x는 prebuilt N-API 바이너리를 제공하지만, Alpine(musl) 변종은 종종 누락되어 source build로 fallback한다.
- **라인 4**: `COPY package.json tsconfig.json nest-cli.json ./` — **lockfile을 포함하지 않음.** `package-lock.json`이 저장소에 없으므로 매 빌드마다 npm 해석이 새로 진행되어 **이미지가 비결정적**이 된다. 보안 패치를 의도치 않게 가져오거나, 반대로 동일 코드가 다른 결과를 내는 원인이 된다.
- **라인 5**: `RUN npm install --no-fund --no-audit` — `npm ci`가 아니라 `npm install`. lockfile이 없으니 `npm ci`를 못쓰는 게 맞지만, 그 자체가 위 위험을 강화. `--no-audit`은 빌드 시 audit 호출 차단 (CVE 알림을 의도적으로 무시).
- **라인 6-7**: src 복사 후 `npm run build` (= `nest build`). devDependencies가 라인 5에서 설치되어 가용.
- **라인 9**: 새 stage `runtime`. builder는 이미지에 포함되지 않음.
- **라인 11**: `ENV NODE_ENV=production` — npm은 이 환경에서 devDeps를 스킵하지만, 라인 13에서 builder의 `node_modules` 전체를 복사하므로 devDeps가 함께 옮겨진다. 즉 이미지에 ts-jest 등 빌드툴이 잔류 → 공격 표면 증가, 이미지 크기 증가.
- **라인 13**: `COPY --from=builder /app/node_modules ./node_modules` — 위 라인 11 효과를 무효화. `npm prune --production`이나 별도 install 단계가 필요. better-sqlite3 네이티브 .node 파일은 보존돼야 하므로 `npm prune`이 안전.
- **라인 15**: `mkdir -p /app/var` — SQLite 폴백 경로(`./var/audit.db`). 비루트 사용자로 쓰는 경우 권한 문제를 만나기 쉬움(현 Dockerfile은 root로 실행).
- **라인 16**: `EXPOSE 8083` — 문서화 목적, 실제 publish는 compose/k8s 측에서.
- **라인 17**: `CMD ["node", "dist/main.js"]` — `npm start` 대신 node 직접 실행 (PID 1로 node 자체). exec form 사용으로 SIGTERM이 node에 직접 전달되어 `app.enableShutdownHooks()` 동작 보장. 자주 보는 실수는 `CMD npm start` (shell form) — npm이 PID 1이 되어 자식 신호 전달이 깨짐.

**짚어볼 점**
- **lockfile 부재 + `npm install`**: 재현 가능한 빌드 손상. CVE/supply-chain 관점에서도 위험.
- **devDependencies 잔류**: runtime 이미지에 ts-jest, @types/*, nest CLI까지 포함됨. 표면 + 크기.
- **non-root user 부재**: USER 지시어 없음. compromise 시 컨테이너 내부에서 root 권한. `chown -R node:node /app && USER node` 권장.
- **HEALTHCHECK 부재**: `/health`가 있는데 컨테이너 차원의 healthcheck로 연결되지 않음. orchestrator-only 시 OK이나 docker run 단독 사용 시 회복력 저하.
- **build context**: src와 manifest만 복사하니 비밀 누설 위험은 낮음. 그러나 `.dockerignore` 내용은 본 리뷰 범위 외. `.env`가 누락 보장되는지 확인 권장.

**파일 수준 평가**
- 강점:
  1. 멀티스테이지로 빌드 도구가 최종 이미지에 들어가지 않도록 시도.
  2. exec-form CMD로 신호 전파 정상.
  3. apk `--no-cache`로 이미지 크기 관리.
- 위험:
  1. lockfile 부재 + `npm install` → 비결정 빌드 + supply-chain 표면.
  2. node_modules 전체 복사로 devDeps 잔류.
  3. root user 실행, HEALTHCHECK 부재.
- 개선 권고:
  1. `package-lock.json` 커밋 + `npm ci --omit=dev` (또는 두 단계 install).
  2. `RUN npm prune --production` 추가하여 devDeps 제거.
  3. `USER node`(또는 전용 uid) + 컨테이너 HEALTHCHECK `CMD wget -qO- http://localhost:8083/health || exit 1`.
- 재읽기 권고 레벨: 1 (단순 토폴로지 확인)
- 이유: 구조는 표준이며 LOC가 짧아 라인 단위 재분석은 불필요. 위 권고 반영 시 다시 Lv1 confirm.

[← INDEX.md](./INDEX.md) | 관련: `package.json.md`, `src/main.ts.md`
