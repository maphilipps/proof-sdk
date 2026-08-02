export type CoverageThreshold = 'red' | 'yellow' | 'green';

export interface CoverageEntry {
  reqId: string;
  score: number;
  blockId?: string;
}

export function deriveThreshold(score: number): CoverageThreshold {
  if (score < 30) return 'red';
  if (score <= 70) return 'yellow';
  return 'green';
}

export function parseCoverageResponse(input: unknown): CoverageEntry[] {
  if (!input || typeof input !== 'object') return [];
  const scores = (input as { scores?: unknown }).scores;
  if (!Array.isArray(scores)) return [];
  return scores.flatMap((value): CoverageEntry[] => {
    if (!value || typeof value !== 'object') return [];
    const raw = value as { reqId?: unknown; score?: unknown; blockId?: unknown };
    if (typeof raw.reqId !== 'string' || typeof raw.score !== 'number') return [];
    return [{
      reqId: raw.reqId,
      score: raw.score,
      ...(typeof raw.blockId === 'string' ? { blockId: raw.blockId } : {}),
    }];
  });
}
