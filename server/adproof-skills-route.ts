/**
 * adProof Skills-Discovery-Endpoint (ADPROOF_MODE=1)
 *
 * GET /adproof/skills
 * Liefert die Manifeste aller proposal-*.SKILL.md aus dem adProof-Repo
 * als JSON. Storage-agnostisch — kein Datenbankzugriff.
 *
 * Frontmatter-Format (eine JSON-Zeile zwischen ---):
 *   ---
 *   {"id":"...","name":"...","description":"...","tools":[...]}
 *   ---
 *   <Prompt-Text>
 */
import { Router, type Request, type Response } from 'express';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// proof-sdk-upstream liegt als Unterverzeichnis neben dem adProof-Repo-Root.
// skills/ liegt im adProof-Repo-Root (eine Ebene über proof-sdk-upstream/).
const DEFAULT_SKILLS_DIR = join(__dirname, '..', '..', 'skills');

interface SkillManifest {
  id: string;
  name: string;
  description: string;
  parallelStrategy?: string;
  tools?: string[];
  maxAgents?: number;
  conflictsWith?: string[];
}

interface SkillEntry {
  id: string;
  name: string;
  description: string;
  parallelStrategy: string;
  tools: string[];
  maxAgents?: number;
  conflictsWith?: string[];
}

function parseFrontmatter(raw: string): SkillManifest | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    const manifest = JSON.parse(match[1]) as Partial<SkillManifest>;
    if (!manifest.id || !manifest.name || !manifest.description) return null;
    return manifest as SkillManifest;
  } catch {
    return null;
  }
}

async function loadSkillManifests(skillsDir: string): Promise<SkillEntry[]> {
  const entries: SkillEntry[] = [];
  try {
    const files = await readdir(skillsDir);
    for (const file of files) {
      if (!file.endsWith('.SKILL.md')) continue;
      const raw = await readFile(join(skillsDir, file), 'utf-8');
      const manifest = parseFrontmatter(raw);
      if (!manifest) continue;
      const entry: SkillEntry = {
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        parallelStrategy: manifest.parallelStrategy ?? 'single',
        tools: manifest.tools ?? [],
      };
      if (manifest.maxAgents !== undefined) entry.maxAgents = manifest.maxAgents;
      if (manifest.conflictsWith !== undefined) entry.conflictsWith = manifest.conflictsWith;
      entries.push(entry);
    }
  } catch {
    // skills-Verzeichnis nicht vorhanden — leere Liste
  }
  return entries;
}

export function createAdProofSkillsRouter(skillsDir = DEFAULT_SKILLS_DIR): Router {
  const router = Router();

  router.get('/adproof/skills', async (_req: Request, res: Response) => {
    const skills = await loadSkillManifests(skillsDir);
    res.json({ skills });
  });

  return router;
}
