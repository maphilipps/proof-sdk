import { aggregate, type BlockDescriptor, type ProvenanceMixRatio, type ProvenanceSidecarEntry } from './provenance-mix-aggregator.js';

export interface TocEntry {
  level: number;
  text: string;
  id: string;
  wordCount: number;
  mixRatio: ProvenanceMixRatio;
}

export type { BlockDescriptor };

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/u).length;
}

function headingLevel(block: BlockDescriptor): number | null {
  if (block.type !== 'heading') return null;
  const match = block.content.match(/^(#{1,6})\s+/u);
  return match ? match[1].length : 1;
}

function headingText(block: BlockDescriptor): string {
  return block.content.replace(/^#{1,6}\s+/u, '').trim();
}

export function buildToc(
  blocks: readonly BlockDescriptor[],
  sidecar: readonly ProvenanceSidecarEntry[],
): TocEntry[] {
  const headingIndexes = blocks
    .map((block, index) => ({ block, index, level: headingLevel(block) }))
    .filter((entry): entry is { block: BlockDescriptor; index: number; level: number } => entry.level !== null);

  return headingIndexes.map((heading, position) => {
    const nextIndex = headingIndexes[position + 1]?.index ?? blocks.length;
    const sectionBlocks = blocks.slice(heading.index, nextIndex);
    return {
      level: heading.level,
      text: headingText(heading.block),
      id: heading.block.id,
      wordCount: sectionBlocks.reduce((total, block) => total + countWords(headingText(block)), 0),
      mixRatio: aggregate(sectionBlocks, sidecar),
    };
  });
}

export function getActiveTocId(
  entries: readonly TocEntry[],
  blockIds: readonly string[],
  activeBlockId: string,
): string | null {
  if (entries.length === 0) return null;
  const activeIndex = blockIds.indexOf(activeBlockId);
  if (activeIndex < 0) return null;

  let active: TocEntry | null = null;
  for (const entry of entries) {
    const headingIndex = blockIds.indexOf(entry.id);
    if (headingIndex >= 0 && headingIndex <= activeIndex) active = entry;
  }
  return active?.id ?? null;
}
