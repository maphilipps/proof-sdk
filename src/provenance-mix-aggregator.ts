export type ProvenanceClass = 'human' | 'ai-sourced' | 'ai-free';

export interface BlockDescriptor {
  id: string;
  type: string;
  content: string;
}

export interface ProvenanceSidecarEntry {
  spanId: string;
  sectionId: string;
  origin: 'human' | 'ai';
  sources?: readonly unknown[];
}

export interface ProvenanceMixRatio {
  human: number;
  aiSourced: number;
  aiFree: number;
  dominant: ProvenanceClass | 'mixed';
}

/** Aggregates the provenance class of each block for TOC and coverage surfaces. */
export function aggregate(
  blocks: readonly BlockDescriptor[],
  sidecar: readonly ProvenanceSidecarEntry[],
): ProvenanceMixRatio {
  if (blocks.length === 0) {
    return { human: 0, aiSourced: 0, aiFree: 0, dominant: 'human' };
  }

  let human = 0;
  let aiSourced = 0;
  let aiFree = 0;

  for (const block of blocks) {
    const entry = sidecar.find((candidate) => candidate.sectionId === block.id);
    if (!entry || entry.origin === 'human') {
      human += 1;
    } else if (entry.sources && entry.sources.length > 0) {
      aiSourced += 1;
    } else {
      aiFree += 1;
    }
  }

  const total = blocks.length;
  const ratio = {
    human: human / total,
    aiSourced: aiSourced / total,
    aiFree: aiFree / total,
  };
  const dominant =
    Object.entries(ratio).find(([, share]) => share > 0.5)?.[0] ?? 'mixed';

  return {
    ...ratio,
    dominant: dominant === 'aiSourced' ? 'ai-sourced' : dominant === 'aiFree' ? 'ai-free' : dominant as 'human' | 'mixed',
  };
}
