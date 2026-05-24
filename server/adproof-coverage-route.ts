/**
 * adProof Coverage-Endpoint (ADPROOF_MODE=1)
 *
 * GET /documents/:slug/adproof/coverage
 *
 * Liest die Marks des Dokuments, klassifiziert sie nach Provenance-Klasse
 * (human / ai-with-source / ai-free) und aggregiert die Coverage-Matrix
 * gegen die RFP-Anforderungen.
 *
 * Für den Tracer-Bullet: Anforderungen sind leer wenn kein RFP indiziert ist
 * → Frontend rendert Empty-State (AC-konform). Spans werden trotzdem
 * zurückgegeben, damit der Provenance-Filter-Tab funktioniert.
 *
 * Aggregations-Logik ist inline (kein Cross-Package-Import aus adProof src/).
 */
import { Router, type Request, type Response } from 'express';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getDocumentBySlug, resolveDocumentAccessRole } from './db.js';

// ---------------------------------------------------------------------------
// Types — Subset der Coverage-Types aus src/coverage-aggregator/types.ts
// ---------------------------------------------------------------------------

type ProvenanceClass = 'human' | 'ai-with-source' | 'ai-free';

interface SpanRef {
  spanId: string;
  sectionId: string;
  text: string;
  provenanceClass: ProvenanceClass;
  by?: string;
  kind?: string;
}

type CoverageStatus = 'covered' | 'covered-ai-free' | 'open';

interface CoverageEntry {
  requirementId: string;
  requirementDescription: string;
  status: CoverageStatus;
  spans: SpanRef[];
}

interface CoverageSummary {
  total: number;
  covered: number;
  coveredAiFree: number;
  open: number;
}

interface CoverageMatrix {
  proposalId: string;
  requirements: CoverageEntry[];
  summary: CoverageSummary;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifySpan(by: string | undefined, hasSources: boolean): ProvenanceClass {
  if (!by || by.startsWith('human:') || by === 'human') return 'human';
  if (by.startsWith('ai:') || by === 'ai') {
    return hasSources ? 'ai-with-source' : 'ai-free';
  }
  return 'human'; // unbekannte Origin → konservativ human
}

function parseMarksJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

function marksToSpans(marks: Record<string, unknown>): SpanRef[] {
  const spans: SpanRef[] = [];
  for (const [id, raw] of Object.entries(marks)) {
    if (!raw || typeof raw !== 'object') continue;
    const mark = raw as Record<string, unknown>;
    const by = typeof mark.by === 'string' ? mark.by : undefined;
    const text = typeof mark.text === 'string' ? mark.text
      : typeof mark.quote === 'string' ? mark.quote
      : typeof mark.content === 'string' ? mark.content
      : '';
    const kind = typeof mark.kind === 'string' ? mark.kind : undefined;
    // Nur Marks mit Text-Inhalt (authored, suggestion, comment) berücksichtigen
    if (!text && kind !== 'authored') continue;
    const hasSources = Array.isArray(mark.sources) && mark.sources.length > 0;
    spans.push({
      spanId: id,
      sectionId: 'unknown',
      text: text.slice(0, 200), // truncate für die UI
      provenanceClass: classifySpan(by, hasSources),
      by,
      kind,
    });
  }
  return spans;
}

function aggregate(proposalId: string, _spans: SpanRef[]): CoverageMatrix {
  // Tracer-Bullet: Keine Requirements → Empty-State
  // Wenn RFP indiziert ist (INT-2, #17), kommt hier die echte Liste rein.
  return {
    proposalId,
    requirements: [],
    summary: { total: 0, covered: 0, coveredAiFree: 0, open: 0 },
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function checkRfpIndexed(slug: string): Promise<boolean> {
  try {
    const files = await readdir(join('proposals', slug, 'rfp'));
    return files.filter((f) => !f.startsWith('.')).length > 0;
  } catch {
    return false;
  }
}

export function createAdProofCoverageRouter(): Router {
  const router = Router();

  router.get('/documents/:slug/adproof/coverage', async (req: Request, res: Response) => {
    // slug aus params — analog zum getSlug()-Pattern in agent-routes.ts
    const rawSlug = req.params.slug;
    const slug = typeof rawSlug === 'string' && rawSlug.trim() ? rawSlug.trim()
      : Array.isArray(rawSlug) && typeof rawSlug[0] === 'string' ? rawSlug[0]
      : null;
    if (!slug) {
      res.status(400).json({ success: false, error: 'Invalid slug' });
      return;
    }

    // Auth — Viewer reicht für Coverage-Read (req.header() liefert string | undefined)
    const authHeader = req.header('authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
      || (typeof req.query.token === 'string' ? req.query.token.trim() : '');
    const role = resolveDocumentAccessRole(slug, token);
    if (!role) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const doc = getDocumentBySlug(slug);
    if (!doc) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    const marks = parseMarksJson(doc.marks);
    const spans = marksToSpans(marks);
    const matrix = aggregate(slug, spans);
    const rfpIndexed = await checkRfpIndexed(slug);

    res.json({
      success: true,
      matrix,
      spans,
      rfpIndexed,
    });
  });

  return router;
}
