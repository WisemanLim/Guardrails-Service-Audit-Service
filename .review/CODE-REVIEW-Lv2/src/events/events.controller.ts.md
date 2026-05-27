# `src/events/events.controller.ts` — Level 2 Review

## Pre-Review Header
- 역할: `/events` 라우트 묶음 — POST 적재, GET 단일/목록 조회. zod 검증 진입점.
- 진입점에서의 거리: 3
- 라인 수: 29
- 주요 export: `EventsController`
- 의존 모듈 (internal): `./events.service`, `./events.types`
- 사용된 외부 패키지: `@nestjs/common` (Controller, Get/Post/Body/Param/Query, HttpException, HttpStatus)
- 부수효과: HTTP 응답 (throw로 4xx, return으로 2xx)
- 동시성 모델: 핸들러는 async — 동시 요청은 Nest의 기본 Express handler로 처리
- 테스트 커버리지 흔적: 없음

## Source & Analysis

```ts path=src/events/events.controller.ts lines=1-29
import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { EventsService } from './events.service';
import { DecisionEventSchema } from './events.types';

@Controller('events')
export class EventsController {
  constructor(private readonly svc: EventsService) {}

  @Post()
  async create(@Body() body: unknown) {
    const parsed = DecisionEventSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ error: 'invalid', issues: parsed.error.flatten() }, HttpStatus.BAD_REQUEST);
    }
    return this.svc.record(parsed.data);
  }

  @Get(':id')
  async byId(@Param('id') id: string) {
    const found = await this.svc.findById(id);
    if (!found) throw new HttpException('not_found', HttpStatus.NOT_FOUND);
    return found;
  }

  @Get()
  async recent(@Query('limit') limit?: string) {
    return { items: await this.svc.recent(limit ? Math.min(Number(limit), 1000) : 100) };
  }
}
```

**분석 / Analysis (Level 2)**

- **L1-3 imports**: Nest 데코레이터 + 자체 서비스/스키마. tree-shaking 영향 없음 (Nest는 CJS).
- **L5 `@Controller('events')`**: 라우트 prefix `/events`.
- **L7 constructor**: 서비스 주입. `private readonly` 단축 패턴 — 클래스 필드 자동 선언.
- **L9-15 `create`**:
  - `@Body() body: unknown`: 명시적 `unknown` — type-safe. body는 Express의 `body-parser`에 의해 JSON 파싱된 객체.
  - `DecisionEventSchema.safeParse(body)`: throw 없는 검증. `.success`/`.data`/`.error`로 분기.
  - 실패 시 `HttpException({error:'invalid', issues: parsed.error.flatten()}, 400)`. `flatten()`은 `{formErrors, fieldErrors}` 구조로 클라이언트에 친절한 에러.
    - 흔한 실수: `parsed.error.format()`(중첩 트리)와 혼동 가능. flatten이 일반적으로 더 다루기 쉬움.
  - 성공 시 `this.svc.record(parsed.data)` — `parsed.data`는 zod의 `.default([])` 등이 적용된 정규화된 객체. TypeScript 타입은 `DecisionEvent` (`z.infer`).
  - 응답: `{ decisionId: '<uuid>' }`. Nest는 return 값을 JSON으로 직렬화.
- **L17-22 `byId`**:
  - `@Param('id') id: string`: 라우트 매개변수. UUID인지 검증 없음.
    - 흔한 실수: `/events/abc` 같은 비-uuid를 받아도 `DbService.findDecisionEvent`로 그대로 전달. Postgres는 UUID 컬럼에 대해 invalid syntax error 반환 → Nest 500. SQLite는 TEXT라 정상 동작 (그러나 0 row).
    - 권장: `@Param('id', new ParseUUIDPipe())` 사용.
  - `this.svc.findById(id)` 결과가 falsy(`null`/undefined)이면 `'not_found'` 문자열로 404. Nest는 문자열을 response body로 직렬화 — JSON 응답: `"not_found"` (object가 아닌 raw string).
    - 흔한 실수: 클라이언트가 `response.json()` 후 `.error` 등에 접근하면 undefined. `{error:'not_found'}`처럼 객체로 통일하는 게 일관적 (POST 실패는 객체 반환).
- **L24-27 `recent`**:
  - `@Query('limit') limit?: string`: query string은 항상 string. 옵셔널.
  - `limit ? Math.min(Number(limit), 1000) : 100`:
    - `limit=""` (빈 문자열)이면 `limit ?` falsy → 100. OK.
    - `limit="abc"` → truthy → `Number("abc") = NaN` → `Math.min(NaN, 1000) = NaN` → `svc.recent(NaN)` → SQL LIMIT NaN → pg error 500. 입력 가드 부재.
    - `limit="-5"` → `Math.min(-5, 1000) = -5` → SQL LIMIT -5 → Postgres ERROR (musí být >= 0).
    - `limit="0"` → `Math.min(0, 1000) = 0` → 빈 결과 반환 (의도된 동작인지 모호).
  - 응답: `{ items: [...] }` — 페이지네이션 메타데이터 없음 (next cursor 등).
  - 흔한 실수: `Math.min`은 음수도 그대로 통과. 0/음수 검증 필요.

**짚어볼 점 / Watch-outs**
- `byId`의 UUID 검증 없음 → driver 별로 거동 다름.
- `recent`의 `limit` 입력 검증이 NaN/음수에 취약.
- 404 응답이 문자열, 400 응답이 객체 — 일관성 부족.
- 에러 메시지 보안: zod `flatten()`이 필드 이름을 노출 — 외부에 공개되는 API라면 정보 누출 우려 (사내라면 OK).
- Auth/Authz 미적용 — POST/events가 인증 없이 열림. 사내 LAN 전제이지만 명시적 mTLS/header 검사 권장.

## File-level Verdict

- **강점**
  1. zod safeParse + flatten으로 검증 응답이 친절.
  2. 컨트롤러가 매우 얇음 — 서비스 계층에 위임.
- **위험**
  1. `limit` 입력 검증 누락 (NaN/음수/0).
  2. UUID 검증 누락 → DB 드라이버 별 에러 차이.
  3. 응답 포맷 일관성 (404 string vs 400 object).
- **개선 권고**
  1. `recent`도 zod로 query 검증 (`z.coerce.number().int().min(1).max(1000).default(100)`).
  2. `@Param('id', new ParseUUIDPipe())` 추가.
  3. 404 응답을 `{error:'not_found'}`로 통일.
- **재읽기 권고 레벨**: Medium — 인증/입력 검증 추가 시 재검토.
