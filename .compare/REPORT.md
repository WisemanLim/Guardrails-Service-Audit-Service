# 비교분석 REPORT: Guardrails-Service-Audit-Service

## 1. 개요 (기준 ref 모듈 → 적용대상, 2026-06-02)

- **기준(ref, 개선·신규):** `DocuGuard-AI-Policy`의 `src/audit/**` 모듈 — Policy/Audit/Redact 통합 프로세스 중 Audit 티어(`audit-app.module.ts`, `events/**`, `db/**`, `health/**`).
- **적용대상(current):** `Guardrails-Service-Audit-Service` — Audit 단일 앱 프로젝트(`src/app.module.ts` + `src/main.ts`, 단일 `PORT=8083`).
- **구조 차이의 핵심:**
  - ref는 멀티 앱모듈 패턴(`AuditAppModule`을 통합 `main.ts`에서 `PORT_AUDIT(8083)`로 부팅).
  - current는 분리형(split) — Audit를 독립 프로젝트로 분리. ref `src/audit/<X>`를 **`audit/` 접두 없이 `src/<X>`로 평탄화(flatten)**.
- **네이밍 정체성:** current = `guardrails-audit-service` / `Guardrails-Service-*`, ref = `docuguard-*` / `DocuGuard-AI-*`. **current 네이밍 보존.**
- **이번 비교의 결론:** Audit 소스는 ref와 **사실상 동일**. 유일한 차이는 `db.service.ts`의 postgres 기본 자격증명 네이밍(의도된 정체성 분기). 신규/개선 코드 이식 대상 **없음.** ref의 신규 Redact 티어는 Audit 범위 밖(Policy-Engine으로 이식됨).

---

## 2. 구조 비교 (디렉토리/파일 차이)

ref `src/audit/<X>` ↔ current `src/<X>` 기준 내용 비교(diff) 결과:

| 파일 (current 기준) | 비교 결과 |
|---|---|
| `db/db.module.ts` | 동일 |
| `db/db.service.ts` | **네이밍만 상이** — postgres 기본값 `docuguard` → `guardrails` (DB/USER/PASSWORD). 의도된 정체성 보존 분기. |
| `db/schema.sqlite.ts` | 동일 |
| `events/events.controller.ts` | 동일 |
| `events/events.module.ts` | 동일 |
| `events/events.service.ts` | 동일 |
| `events/events.types.ts` | 동일 |
| `health/health.controller.ts` | 동일 |
| `app.module.ts` (current) ↔ `audit-app.module.ts` (ref) | 클래스명만 상이(`AppModule` ↔ `AuditAppModule`), import/구성 동일 |
| `main.ts` | ref는 통합 3-리스너 / current는 단일 8083 리스너. 구조 차이일 뿐 Audit 기능 동일 |

- 디렉토리 구조: ref `src/audit/{db,events,health}` ↔ current `src/{db,events,health}` 1:1 대응(평탄화).
- ref에만 있고 current엔 없는 Audit 관련 파일: **없음.** current에만 있는 잉여 파일: 없음.

---

## 3. 의존성 변경 (package.json diff)

ref(`docuguard-ai-policy`)는 Policy+Audit+Redact 통합 패키지라 Audit 단독과 직접 1:1 비교는 부적절. current(`guardrails-audit-service`)는 Audit 전용 최소 의존성을 가짐:

- **current dependencies:** `@nestjs/common/config/core/platform-express`, `better-sqlite3`, `pg`, `reflect-metadata`, `rxjs`, `zod`.
  - ref 통합 패키지 대비 Audit에 불필요한 `ajv`, `ioredis`(Policy/Redis 전용)는 **제외**되어 있어 적절(과잉 의존 없음).
- **devDependencies:** Audit 전용 최소 구성. ref와 달리 `supertest` 미포함(현재 e2e 미사용) — 기능 영향 없음.
- **scripts:** `build/start/start:dev/start:prod/lint/test`. ref와 동일 패턴.
- **결론:** Audit 단독 의존성은 적정. **변경 불필요.**

---

## 4. 개선/추가/수정 항목 (설명 / ref 위치 / 영향도 / QA 리스크)

| 항목 | 설명 | ref 위치 | 영향도 | QA 리스크 |
|---|---|---|---|---|
| Audit 소스 동기화 상태 | events/db/health 전 파일이 ref와 동일. 추가 동기화 불필요 | `src/audit/**` | 없음 | 없음 |
| DB 기본 자격증명 | postgres 기본값 `docuguard` ↔ `guardrails` 네이밍 분기(의도) | `src/audit/db/db.service.ts` (89–91행) | 낮음 | 환경변수 미설정 시 기본값 차이 — `.env`로 명시 권장 |

> **Redact 티어 관련:** ref의 신규 Redact 모듈(`src/redact/**`)은 레다크션 HTTP 서비스로, 데이터 모델·역할상 Audit가 아닌 **Policy-Engine** 범위에 해당한다. 따라서 Audit-Service에는 적용하지 않으며 `Guardrails-Service-Policy-Engine`에 추가했다(해당 프로젝트 REPORT 참조).

---

## 5. 적용 내역 (Applied) (파일별 변경 + 이유)

- **변경 없음.** Audit 소스가 ref와 동일하고, `db.service.ts`의 `guardrails` 기본값은 의도된 정체성 보존이므로 그대로 유지.
- 빌드/테스트 검증만 수행(아래 §7).

---

## 6. 미적용/보류 (Deferred) (이유)

- **`docuguard` → `guardrails` 네이밍 통일은 보류(=현행 유지):** `db.service.ts` 기본 자격증명, 패키지명 등은 의도된 정체성 분기로 보존.
- **Redact 티어 미적용:** Audit 범위 밖 → Policy-Engine으로 이식(상기 §4 참조).
- **단일 프로세스 통합(ref `main.ts`) 미채용:** current는 분리 구조 전제이므로 독립 8083 리스너 유지.
- **테스트 추가 보류:** ref Audit에도 spec 없음. current에도 events 단위 테스트 부재 → §8에 회귀테스트 추가 권고로 명시.

---

## 7. 검증 결과 (build/typecheck/test)

- **환경 주의(사전 이슈):** 작업 경로의 괄호(`Web(Node,Script)`) + 호스트 Node v26으로 `better-sqlite3@11` 네이티브 gyp 빌드 실패 → 일반 `npm install` 실패. **본 비교 작업과 무관한 기존 환경 문제.** 검증을 위해 `npm install --ignore-scripts`로 툴체인(nest CLI/ts/jest)만 설치. (런타임 sqlite 사용 시 호환 Node + 괄호 없는 경로 또는 Docker(node:20-alpine)에서 정상.)
- **Build (Audit-Service):** `nest build` → **성공(exit 0)**. `dist/`에 `main.js`, `app.module.js`, `db/`, `events/`, `health/` 생성 확인.
- **Typecheck:** strict 모드 tsconfig(단, `strictNullChecks`/`noImplicitAny` 명시는 ref Policy 대비 미설정 — 기존 current 설정 유지) 하에서 빌드 통과 = 타입 에러 없음.
- **Test:** spec 파일 없음 → 실행할 테스트 없음(no regression to break). 코드 변경이 없으므로 회귀 위험 없음.
- **결론:** 변경 없음 + 빌드 그린.

---

## 8. QA 체크리스트 & 회귀테스트 권고

**Audit 기능 (회귀)**
- [ ] `POST /events`(또는 events 컨트롤러 라우트)로 decision-event 적재 → 저장 확인.
- [ ] events 조회/페이지네이션(있다면) 동작.
- [ ] `GET /health`(8083) → `{status:'ok', db:{driver, available}}` 반환.
- [ ] `db.service.ts` 기본 자격증명(`guardrails`) 및 `.env` 오버라이드 정상.
- [ ] sqlite/postgres 드라이버 전환 시 events 스키마 정상 적용.

**빌드/배포**
- [ ] Docker(node:20-alpine)에서 `better-sqlite3` 정상 빌드 및 8083 EXPOSE 확인.
- [ ] 그레이스풀 셧다운(`enableShutdownHooks`) 동작.

**테스트 추가 권고**
- [ ] `events.service.spec.ts`(적재/검증 로직), `events.controller` e2e 추가.
- [ ] `zod` 이벤트 스키마 검증 경계 테스트.
