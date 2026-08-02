export type RfpFileStatus = 'indexing' | 'ready';

export interface RfpFile {
  filename: string;
  chunkCount: number;
  uploadedAt?: string;
  status: RfpFileStatus;
}

export interface SearchHit {
  sourceFile: string;
  text: string;
  score: number;
  pageRange?: string;
}

interface RawFile {
  filename: string;
  chunkCount: number;
  uploadedAt?: string;
}

export function deriveFileStatus(file: Pick<RawFile, 'chunkCount'>): RfpFileStatus {
  return file.chunkCount > 0 ? 'ready' : 'indexing';
}

export function parseFileListResponse(input: unknown): RfpFile[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((value): RfpFile[] => {
    if (!value || typeof value !== 'object') return [];
    const raw = value as Partial<RawFile>;
    if (typeof raw.filename !== 'string' || typeof raw.chunkCount !== 'number') return [];
    return [{
      filename: raw.filename,
      chunkCount: raw.chunkCount,
      ...(typeof raw.uploadedAt === 'string' ? { uploadedAt: raw.uploadedAt } : {}),
      status: deriveFileStatus({ chunkCount: raw.chunkCount }),
    }];
  });
}

export function parseSearchResponse(input: unknown): SearchHit[] {
  if (!input || typeof input !== 'object') return [];
  const hits = (input as { hits?: unknown }).hits;
  if (!Array.isArray(hits)) return [];
  return hits.flatMap((value): SearchHit[] => {
    if (!value || typeof value !== 'object') return [];
    const raw = value as Partial<SearchHit>;
    if (
      typeof raw.sourceFile !== 'string' ||
      typeof raw.text !== 'string' ||
      typeof raw.score !== 'number'
    ) return [];
    return [{
      sourceFile: raw.sourceFile,
      text: raw.text,
      score: raw.score,
      ...(typeof raw.pageRange === 'string' ? { pageRange: raw.pageRange } : {}),
    }];
  });
}
