/**
 * adProof RFP-Source-Endpoint (ADPROOF_MODE=1)
 *
 * POST /documents/:slug/rfp/upload       — TXT/MD-Datei hochladen + indizieren
 * GET  /documents/:slug/rfp/files        — Hochgeladene RFP-Dateien listen
 * POST /documents/:slug/rfp/search       — Semantische Suche im RFP-Index
 *
 * Upload-Mechanismus: express.raw() mit Raw-Bytes im Body.
 * Der Dateiname kommt via Header X-Rfp-Filename.
 * Kein multer nötig — keine neue Abhängigkeit.
 *
 * Import aus adProof src/ via relativer Pfad (tsx löst .js → .ts auf).
 * Issue #37 — S2
 */
import express, { Router, type Request, type Response } from 'express';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getDocumentBySlug, resolveDocumentAccessRole } from './db.js';

// Cross-package imports (tsx resolves .js → .ts at runtime)
import { uploadRfp, listRfpFiles } from '../../src/rfp-source-orchestrator/index.js';
import { searchRfp, createMockEmbeddingProvider } from '../../src/rfp-indexer/index.js';

// ---------------------------------------------------------------------------
// Validation helpers (identisch zu tests/unit/rfp-route.test.ts — inline)
// ---------------------------------------------------------------------------

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md']);

function validateRfpFilename(filename: string): { ok: true; ext: string } | { ok: false; error: string } {
  if (!filename || typeof filename !== 'string' || !filename.trim()) {
    return { ok: false, error: 'Kein Dateiname angegeben' };
  }
  const trimmed = filename.trim();
  const dotIdx = trimmed.lastIndexOf('.');
  if (dotIdx === -1) {
    return { ok: false, error: 'Datei hat keine Erweiterung' };
  }
  const ext = trimmed.slice(dotIdx).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Format "${ext}" nicht unterstützt. Erlaubt: .txt, .md` };
  }
  return { ok: true, ext };
}

function parseFilenameHeader(raw: string | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const decoded = decodeURIComponent(raw.trim());
  // Pfad-Traversal abwehren
  if (decoded.includes('/') || decoded.includes('\\') || decoded.includes('..')) return null;
  return decoded || null;
}

// ---------------------------------------------------------------------------
// Slug + Auth helpers
// ---------------------------------------------------------------------------

function resolveSlug(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return null;
}

function resolveAuth(req: Request, slug: string): string | null {
  const authHeader = req.header('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    || (typeof req.query.token === 'string' ? req.query.token.trim() : '');
  return resolveDocumentAccessRole(slug, token);
}

// ---------------------------------------------------------------------------
// Embedding provider — mock für Phase-1 MVP
// (In Produktion: austauschen gegen OpenAI/Anthropic Embeddings via env-config)
// ---------------------------------------------------------------------------

const provider = createMockEmbeddingProvider(128);

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createAdProofRfpRouter(): Router {
  const router = Router();

  // ── POST /documents/:slug/rfp/upload ──────────────────────────────────────
  // Body: raw bytes, Header: X-Rfp-Filename: lastenheft.txt
  router.post(
    '/documents/:slug/rfp/upload',
    express.raw({ type: '*/*', limit: '5mb' }),
    async (req: Request, res: Response): Promise<void> => {
      const slug = resolveSlug(req.params.slug) ?? '';
      if (!slug) {
        res.status(400).json({ success: false, error: 'Invalid slug' });
        return;
      }

      const role = resolveAuth(req, slug);
      if (!role) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const doc = getDocumentBySlug(slug);
      if (!doc) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      // Dateiname aus Header parsen
      const rawFilename = req.header('x-rfp-filename');
      const filename = parseFilenameHeader(rawFilename);
      if (!filename) {
        res.status(400).json({ success: false, error: 'X-Rfp-Filename Header fehlt oder ungültig' });
        return;
      }

      // Format validieren
      const validation = validateRfpFilename(filename);
      if (!validation.ok) {
        res.status(422).json({ success: false, error: validation.error });
        return;
      }

      // Body muss Buffer sein (durch express.raw())
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ success: false, error: 'Leerer oder kein Datei-Body' });
        return;
      }

      // Sicherstellen, dass proposals/{slug}/rfp/ existiert
      await mkdir(join('proposals', slug, 'rfp'), { recursive: true });

      try {
        const result = await uploadRfp(slug, req.body, filename, provider);
        res.json({ success: true, ...result });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('UnsupportedFormatError')) {
          res.status(422).json({ success: false, error: msg });
        } else {
          res.status(500).json({ success: false, error: 'Upload fehlgeschlagen', detail: msg });
        }
      }
    },
  );

  // ── GET /documents/:slug/rfp/files ────────────────────────────────────────
  router.get('/documents/:slug/rfp/files', async (req: Request, res: Response): Promise<void> => {
    const slug = resolveSlug(req.params.slug) ?? '';
    if (!slug) {
      res.status(400).json({ success: false, error: 'Invalid slug' });
      return;
    }

    const role = resolveAuth(req, slug);
    if (!role) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const doc = getDocumentBySlug(slug);
    if (!doc) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    try {
      const files = await listRfpFiles(slug);
      res.json({ success: true, files });
    } catch {
      res.json({ success: true, files: [] });
    }
  });

  // ── POST /documents/:slug/rfp/search ──────────────────────────────────────
  router.post('/documents/:slug/rfp/search', async (req: Request, res: Response): Promise<void> => {
    const slug = resolveSlug(req.params.slug) ?? '';
    if (!slug) {
      res.status(400).json({ success: false, error: 'Invalid slug' });
      return;
    }

    const role = resolveAuth(req, slug);
    if (!role) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const doc = getDocumentBySlug(slug);
    if (!doc) {
      res.status(404).json({ success: false, error: 'Document not found' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query) {
      res.status(400).json({ success: false, error: 'query darf nicht leer sein' });
      return;
    }
    const topK = typeof body.topK === 'number' ? body.topK : 5;

    try {
      const hits = await searchRfp(slug, query, provider, topK);
      res.json({ success: true, hits });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: 'Suche fehlgeschlagen', detail: msg });
    }
  });

  return router;
}
