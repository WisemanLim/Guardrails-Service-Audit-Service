# `src/health/` Directory Abstract

## 역할
컨테이너/오케스트레이터 헬스 프로브 엔드포인트.

## 구성
- 파일 1개: `health.controller.ts` (11 LOC)
- 라우트 1개: `GET /health`

## 응답 형태
```json
{
  "status": "ok",
  "db": { "driver": "postgres|sqlite", "available": true|false }
}
```

## 외부 결합
- `../db/db.service.ts` (DbService) — `driver`, `isAvailable()` 두 멤버만 사용.

## 진입점 거리
| 파일 | distance |
| :-- | --: |
| `health.controller.ts` | 2 (main → AppModule → HealthController) |

## 강점
1. 의존성 최소 (DbService 단일).
2. 무상태 동기 핸들러로 race-free.
3. 변경 비용 0에 가까움.

## 주의점
1. **`status`가 항상 `'ok'`** — DB 미가용에도 200. readiness probe로 부적합.
2. **driver 명 외부 노출** — 인프라 디테일 누출.
3. **실측 ping 부재** — `isAvailable()`이 boolean flag만 검사.

## 권고
- liveness(`/health/live`) ↔ readiness(`/health/ready`) 분리.
- DbService에 경량 ping 추가하여 readiness가 실측 기반이 되도록.

세부 라인 리뷰: `health.controller.ts.md`
