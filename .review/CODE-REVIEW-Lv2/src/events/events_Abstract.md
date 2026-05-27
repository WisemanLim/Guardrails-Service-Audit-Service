# `src/events/` Directory Abstract

## 역할
HTTP 경계에서 `decision_events` 적재/조회를 처리하는 핵심 도메인 모듈. zod 검증 → 서비스 → DB(또는 메모리 폴백)까지의 경로를 담당.

## 구성
| 파일 | LOC | 역할 |
| :-- | --: | :-- |
| `events.module.ts` | 6 | 컨트롤러 + 서비스 묶음, 서비스 export |
| `events.controller.ts` | 29 | POST /events, GET /events, GET /events/:id |
| `events.service.ts` | 52 | DB 가용/불가용 분기, in-memory ring buffer(1000) |
| `events.types.ts` | 18 | `DecisionEventSchema` (zod) + 추론 타입 |

## 라우트
- `POST /events` — MCP Server 적재 hot-path
- `GET /events?limit=N` — Admin 최근 목록 (limit ≤ 1000)
- `GET /events/:id` — `explain_decision` 백엔드

## 외부 결합
- `../db/db.service.ts` (DbService, @Global 주입)
- `zod` (검증)
- `crypto.randomUUID` (id 발급)

## 진입점 거리
| 파일 | distance |
| :-- | --: |
| `events.module.ts` | 2 |
| `events.controller.ts` | 3 |
| `events.service.ts` | 4 |
| `events.types.ts` | 3-4 (컨트롤러/서비스에서 import) |

## 강점
1. zod 검증을 컨트롤러 경계에서 일관 적용.
2. DB 미가용 시 부드러운 폴백 (서비스 가용성 우선).
3. 책임이 좁고 명확.

## 주의점
1. **memoryBuffer drain 부재** — DB 복구 후에도 메모리 잔존 이벤트가 DB로 옮겨지지 않음. 데이터 유실 가능.
2. **응답 shape 불일치** — DB row vs zod 객체. 클라이언트가 두 형태를 받음.
3. **limit 파라미터 NaN-safe 아님** — `Math.min(Number("abc"), 1000) = NaN` → SQL 500.
4. **`decisionId` 클라이언트 신뢰** — UNIQUE 충돌 시 500. idempotency 처리 없음.
5. **느슨한 zod 제약** — `riskScore` 범위, `textHash` 길이 무검증.

## 권고
- DB 복구 이벤트 감지 → 메모리 버퍼 drain.
- limit을 zod로 검증 (`z.coerce.number().int().min(1).max(1000)`).
- 응답 매퍼를 한 자리에 통일.

세부 라인 리뷰: 각 `*.ts.md`
