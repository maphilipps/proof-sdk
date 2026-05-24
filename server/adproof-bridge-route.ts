/**
 * adProof Bridge-Tool-Dispatcher (ADPROOF_MODE=1)
 *
 * Registriert alle Tools aus src/bridge/tool-registry.ts als HTTP-Endpoints:
 *   POST /documents/:slug/bridge/:toolName
 *
 * Jedes Tool erhält den Request-Body als JSON-Input.
 * Die proposalId wird aus dem Slug bezogen (Slug === ProposalId in adProof).
 *
 * Auth-Pattern: identisch zu adproof-rfp-route.ts
 *
 * Issue #34 — Bridge-Wiring
 */
import { Router, type Request, type Response } from 'express';
import { getDocumentBySlug, resolveDocumentAccessRole } from './db.js';

// Cross-package imports (tsx resolves .js → .ts at runtime)
import { registerTools } from '../../src/bridge/tool-registry.js';
import { createMockEmbeddingProvider } from '../../src/rfp-indexer/index.js';

// ---------------------------------------------------------------------------
// Helpers (identisch zu adproof-rfp-route.ts)
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

// Embedding provider — Mock für Phase-1 MVP
// Austauschen gegen OpenAI/Anthropic in Produktion (ADR 0008)
const provider = createMockEmbeddingProvider(128);

export function createAdProofBridgeRouter(): Router {
  const router = Router();
  const tools = registerTools({ provider });
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  router.post('/documents/:slug/bridge/:toolName', async (req: Request, res: Response): Promise<void> => {
    const slug = resolveSlug(req.params.slug) ?? '';
    if (!slug) {
      res.status(400).json({ ok: false, error: 'Invalid slug' });
      return;
    }

    const role = resolveAuth(req, slug);
    if (!role) {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }

    const doc = getDocumentBySlug(slug);
    if (!doc) {
      res.status(404).json({ ok: false, error: 'Document not found' });
      return;
    }

    const rawToolName = req.params['toolName'];
    const toolName = typeof rawToolName === 'string' ? rawToolName : String(rawToolName ?? '');
    const tool = toolMap.get(toolName);
    if (!tool) {
      res.status(404).json({
        ok: false,
        error: `Bridge-Tool "${toolName}" nicht gefunden`,
        availableTools: [...toolMap.keys()],
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    // proposalId aus Slug ableiten — in adProof sind Slug und ProposalId identisch
    const input: Record<string, unknown> = { ...body, proposalId: slug };

    try {
      const result = await tool.handler(input);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: 'Tool-Ausführung fehlgeschlagen', detail: msg });
    }
  });

  return router;
}
