# `src/events/events.service.ts` — Level 2 Review

## Pre-Review Header
- 역할: 결정 이벤트 적재/조회의 비즈니스 로직. DB 가용/불가용 분기, in-memory ring buffer fallback(1000건).
- 진입점에서의 거리: 4
- 라인 수: 52
- 주요 export: `EventsService`
- 의존 모듈 (internal): `../db/db.service`, `./events.types`
- 사용된 외부 패키지: `@nestjs/common`, `crypto` (Node 내장, randomUUID)
- 부수효과: 메모리 buffer 변경, DB write (insert), 로그
- 동시성 모델: async, 단일 이벤트 루프. 메모리 buffer는 race-free (single-threaded JS).
- 테스트 커버리지 흔적: 없음

## Source & Analysis

```ts path=src/events/events.service.ts lines=1-52
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DbService } from '../db/db.service';
import { DecisionEvent } from './events.types';

@Injectable()
export class EventsService {
  private readonly log = new Logger(EventsService.name);
  private readonly memoryBuffer: DecisionEvent[] = [];
  private readonly memoryLimit = 1000;

  constructor(private readonly db: DbService) {}

  async record(ev: DecisionEvent): Promise<{ decisionId: string }> {
    const id = ev.decisionId ?? randomUUID();
    if (!this.db.isAvailable()) {
      this.memoryBuffer.push({ ...ev, decisionId: id });
      if (this.memoryBuffer.length > this.memoryLimit) this.memoryBuffer.shift();
      return { decisionId: id };
    }
    await this.db.insertDecisionEvent({
      decisionId: id,
      tenantId: ev.tenantId,
      sessionId: ev.sessionId,
      domain: ev.domain,
      locale: ev.locale,
      ioType: ev.ioType,
      textHash: ev.textHash,
      decision: ev.decision,
      riskScore: ev.riskScore,
      matchedRules: ev.matchedRules,
      categories: ev.categories,
      policyVersion: ev.policyVersion,
      latencyMs: ev.latencyMs,
    });
    return { decisionId: id };
  }

  async findById(decisionId: string): Promise<unknown | null> {
    if (this.db.isAvailable()) {
      return this.db.findDecisionEvent(decisionId);
    }
    return this.memoryBuffer.find((e) => e.decisionId === decisionId) ?? null;
  }

  async recent(limit = 100): Promise<unknown[]> {
    if (this.db.isAvailable()) {
      return this.db.recentDecisionEvents(limit);
    }
    return this.memoryBuffer.slice(-limit).reverse();
  }
}
```

**분석 / Analysis (Level 2)**

- **L1-4 imports**: Nest + Node crypto + 내부 DB facade + 타입.
- **L7-10 클래스 필드**:
  - `log` (미사용. 인스턴스화만 됨 — dead code).
  - `memoryBuffer: DecisionEvent[]` — 단순 배열. `Array.prototype.shift`는 O(n) — limit=1000 기준 buffer overflow 시 약간의 cost.
    - 흔한 실수: ring buffer를 `shift/push`로 구현하면 매 overflow마다 전체 시프트. 진정한 ring이라면 두 포인터 또는 modulo index. 단, 1000짜리는 무시 가능.
  - `memoryLimit = 1000` — 하드코딩.
- **L12 constructor**: `DbService` 주입. `@Global()` 모듈 덕에 imports 불필요.
- **L14-36 `record`**:
  - `const id = ev.decisionId ?? randomUUID()`: 클라이언트가 ID를 보내지 않으면 서버 생성. UUID v4 (random). idempotency 키로도 활용 가능.
  - `if (!this.db.isAvailable())`:
    - `this.memoryBuffer.push({ ...ev, decisionId: id })`: spread + id 덮어쓰기. `ev`에 enumerable property만 복사 (zod가 정규화한 객체이므로 안전).
    - `if (length > limit) shift()`: FIFO. 가장 오래된 1건 제거.
  - 흔한 실수: DB 미가용 fallback이 **silently** 메모리에 쌓이기만 함. 다음과 같은 갭이 있음:
    1. DB 복구 후 메모리의 이벤트들이 drain되지 않음.
    2. 프로세스 재시작 시 메모리 데이터 유실.
    3. 호출자(MCP Server)는 200 응답을 받지만 영속화 보장 없음.
  - DB 가용 시: 카멜케이스 필드 13개를 모두 명시적으로 매핑해 `db.insertDecisionEvent`에 전달. zod의 `.default([])` 덕에 `matchedRules`/`categories`는 항상 배열.
  - 흔한 실수: 객체 13개 필드 수동 매핑은 누락 위험. `db.insertDecisionEvent({ ...ev, decisionId: id })` 으로 단순화 가능 (필드명이 거의 동일하므로 — 단 `decisionId`는 옵셔널에서 필수로 좁아져야 함). 현재 명시 매핑은 안전하지만 유지보수 시 컬럼 추가 누락 위험.
  - `await ... insertDecisionEvent(...)`: 실패 시 throw → 컨트롤러로 전파 → Nest 기본 500. 호출자는 동일 페이로드로 재시도 (idempotency 키가 있다면 안전).
- **L39-43 `findById`**:
  - DB 가용 → `findDecisionEvent` 위임.
  - 미가용 → `memoryBuffer.find(...)`. 선형 검색 O(n=1000). 무시 가능.
  - 반환 타입 `unknown | null` — 매우 느슨. 컨트롤러도 그대로 전달.
    - 흔한 실수: `unknown`보다는 `DecisionEventRow | DecisionEvent | null` 같이 명확한 타입이 호출자 IDE 지원에 유리.
- **L45-50 `recent`**:
  - DB 가용 → `recentDecisionEvents(limit)`.
  - 미가용 → `memoryBuffer.slice(-limit).reverse()`. `slice(-limit)`는 마지막 N개. reverse로 최신순.
    - 흔한 실수: `.reverse()`는 새 배열을 만들지 않고 in-place — 그런데 `slice`가 새 배열을 반환하므로 buffer 자체는 보존됨. OK.
  - 빈 buffer일 때 `slice(-100)` = `[]`, reverse = `[]`. 안전.

**짚어볼 점 / Watch-outs**
- **메모리 fallback drain 부재** — 위험 핫스팟 #1.
- `log` 필드 dead code (선언만, 사용 0).
- 반환 타입 `unknown`이 컨트롤러까지 전파.
- `record`의 필드 수동 매핑은 컬럼 추가 시 누락 위험.

## File-level Verdict

- **강점**
  1. 가독성 좋고 분기 단순.
  2. UUID 자동 발급 + 클라이언트 override 동시 지원.
  3. Async 일관 — 호출자 ergonomics 좋음.
- **위험**
  1. DB 복구 시 메모리 buffer drain 안 됨 (데이터 정합성).
  2. fallback 모드가 응답을 200으로 위장 (영속화 보장 없음).
  3. 반환 타입이 `unknown` — 컨트롤러/클라이언트에서 안전성 손실.
- **개선 권고**
  1. DB 복구 hook(예: `DbService` 내 `setInterval` ping + event emitter)에서 buffer drain.
  2. fallback 모드 응답에 헤더(`x-audit-fallback: memory`) 또는 명시 필드 추가.
  3. 반환 타입을 `DecisionEventRow`/`DecisionEvent` 유니온으로 좁히기.
- **재읽기 권고 레벨**: High — DB 가용/복구 워크플로 변경 시 핵심.
