/**
 * adProof Assets-Endpoint (ADPROOF_MODE=1)
 *
 * POST /documents/:slug/assets/upload   — Bild hochladen + speichern
 * GET  /documents/:slug/assets/list     — Gespeicherte Assets listen
 * GET  /d/:slug/assets/:filename        — Asset abrufen (für img-src)
 *
 * Upload-Mechanismus: express.raw() mit Raw-Bytes im Body.
 * Der MIME-Typ kommt via Content-Type Header.
 * Erlaubte Typen: image/png, image/jpeg, image/webp (kein SVG — XSS-Risiko)
 *
 * Import aus adProof src/ via relativer Pfad (tsx löst .js → .ts auf).
 * Issue #44 — Slice 1
 */
import express, { Router, type Request, type Response } from 'express';
import { getDocumentBySlug, resolveDocumentAccessRole } from './db.js';

// Cross-package imports (tsx resolves .js → .ts at runtime)
import {
  put,
  get,
  list,
  UnsupportedContentTypeError,
  FileTooLargeError,
} from '../../src/assets-store/index.js';

// ---------------------------------------------------------------------------
// Auth helpers
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
// Router
// ---------------------------------------------------------------------------

export function createAdProofAssetsRouter(): Router {
  const router = Router();

  // ── POST /documents/:slug/assets/upload ──────────────────────────────────
  // Body: raw bytes, Content-Type: image/png | image/jpeg | image/webp
  router.post(
    '/documents/:slug/assets/upload',
    express.raw({ type: '*/*', limit: '11mb' }),
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

      const mimeType = req.header('content-type')?.split(';')[0]?.trim() ?? '';
      if (!mimeType) {
        res.status(400).json({ success: false, error: 'Content-Type fehlt' });
        return;
      }

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ success: false, error: 'Leerer oder kein Datei-Body' });
        return;
      }

      try {
        const ref = await put(slug, { buffer: req.body, mimeType });
        res.json({ success: true, path: ref.path });
      } catch (err: unknown) {
        if (err instanceof UnsupportedContentTypeError) {
          res.status(415).json({ success: false, error: err.message });
        } else if (err instanceof FileTooLargeError) {
          res.status(413).json({ success: false, error: err.message });
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          res.status(500).json({ success: false, error: 'Upload fehlgeschlagen', detail: msg });
        }
      }
    },
  );

  // ── GET /documents/:slug/assets/list ─────────────────────────────────────
  router.get('/documents/:slug/assets/list', async (req: Request, res: Response): Promise<void> => {
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
      const assets = await list(slug);
      res.json({ success: true, assets });
    } catch {
      res.json({ success: true, assets: [] });
    }
  });

  // ── GET /d/:slug/assets/:filename ────────────────────────────────────────
  // Öffentlich (kein Auth) — Assets werden via img src referenziert
  router.get('/d/:slug/assets/:filename', async (req: Request, res: Response): Promise<void> => {
    const slug = resolveSlug(req.params.slug) ?? '';
    const filename = typeof req.params.filename === 'string' ? req.params.filename : '';

    if (!slug || !filename) {
      res.status(400).end();
      return;
    }

    // Pfad-Traversal abwehren
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      res.status(400).end();
      return;
    }

    try {
      const assetData = await get(slug, `assets/${filename}`);
      res.setHeader('Content-Type', assetData.mimeType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(assetData.buffer);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('AssetNotFoundError')) {
        res.status(404).end();
      } else {
        res.status(500).end();
      }
    }
  });

  return router;
}
