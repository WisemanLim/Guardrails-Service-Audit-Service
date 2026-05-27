# `src/events/events.types.ts` — Level 2 Review

## Pre-Review Header
- 역할: 결정 이벤트 페이로드의 zod 스키마 + 추론된 TS 타입 export
- 진입점에서의 거리: 4
- 라인 수: 18
- 주요 export: `DecisionEventSchema`, `DecisionEvent`
- 의존 모듈 (internal): 없음
- 사용된 외부 패키지: `zod`
- 부수효과: 없음
- 동시성 모델: N/A
- 테스트 커버리지 흔적: 없음

## Source & Analysis

```ts path=src/events/events.types.ts lines=1-18
import { z } from 'zod';

export const DecisionEventSchema = z.object({
  decisionId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  sessionId: z.string().optional(),
  domain: z.string(),
  locale: z.string(),
  ioType: z.enum(['input', 'output', 'both']),
  textHash: z.string(),
  decision: z.string(),
  riskScore: z.number().default(0),
  matchedRules: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  policyVersion: z.string().optional(),
  latencyMs: z.number().int().optional(),
});
export type DecisionEvent = z.infer<typeof DecisionEventSchema>;
```

**분석 / Analysis (Level 2)**

- **L1 import**: `z` 네임스페이스 — zod 표준.
- **L3 `z.object({...})`**: 강타입 객체 스키마.
- **L4 `decisionId: z.string().uuid().optional()`**: UUID 형식. optional → undefined 허용.
  - 흔한 실수: `z.optional(z.string().uuid())`와 `z.string().uuid().optional()`은 등가. 후자가 chain 가독성 좋음.
- **L5 `tenantId`**: UUID 옵셔널.
- **L6 `sessionId: z.string().optional()`**: 형식 무제약 string.
- **L7 `domain: z.string()`**: 필수. 빈 문자열도 통과(`min(1)` 없음). README에 "global|manufacturing-food|..." 예시 있으나 코드에서는 free-form.
  - 흔한 실수: `z.string()`만으로 `''`를 막지 않음. `z.string().min(1)` 또는 enum이 안전.
- **L8 `locale: z.string()`**: BCP 47 형식 검증 없음 — `'ko-KR'`도 `'invalid'`도 통과.
- **L9 `ioType: z.enum(['input','output','both'])`**: 정확한 enum 검증. TS 타입도 union literal로 좁아짐.
- **L10 `textHash: z.string()`**: SHA-256 hex 64자 가정이나 길이/regex 검증 없음.
  - 권장: `z.string().regex(/^[0-9a-f]{64}$/)` 또는 `length(64)`.
- **L11 `decision: z.string()`**: enum 미지정. README는 일부 값을 시사하지만 free-form.
- **L12 `riskScore: z.number().default(0)`**: 미제공 시 0. 범위 검증 없음 (0..1 가정인데 음수/큰 수 통과). `z.number().min(0).max(1).default(0)` 권장.
- **L13 `matchedRules: z.array(z.string()).default([])`**: 미제공/null이면 빈 배열. NULL 보내면 zod는 `null`을 array로 보지 않아 invalid — `optional+default` 조합으로 안정.
- **L14 `categories`**: 같은 패턴.
- **L15 `policyVersion: z.string().optional()`**: SemVer 등 미검증.
- **L16 `latencyMs: z.number().int().optional()`**: 정수만. 음수 허용 (`min(0)` 없음).
- **L18 `z.infer`**: TS 정적 타입 자동 생성.

**짚어볼 점 / Watch-outs**
- 비즈니스 제약(textHash 길이, riskScore 범위, locale 형식)이 스키마에 반영되지 않아 외부 신뢰 경계로서 약함.
- `domain`/`decision`은 enum이 적합하지만 free-form. DB CHECK도 없음 — 오타가 누적되면 분석 시 정합성 문제.
- zod에서 `unknown extra fields`는 기본 `strip`(제거). `passthrough` 미사용 — 안전한 기본값.

## File-level Verdict

- **강점**
  1. 컨트롤러 입력 검증을 한 자리에 모음.
  2. `z.infer`로 TS 타입 자동 동기화.
  3. default 값으로 옵셔널 필드 단순화.
- **위험**
  1. 핵심 도메인 제약(범위/형식) 미검증.
  2. `decision`/`domain` 같은 정합성 키가 free-form.
- **개선 권고**
  1. `textHash`: `z.string().regex(/^[0-9a-f]{64}$/)`.
  2. `riskScore`: `.min(0).max(1)`.
  3. `decision`/`ioType`처럼 enum화 (가능한 값을 README와 동기화).
  4. `latencyMs`: `.min(0)`.
- **재읽기 권고 레벨**: Medium — 도메인 스펙 확정 후 한 차례 강화.
