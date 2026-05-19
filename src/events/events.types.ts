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
