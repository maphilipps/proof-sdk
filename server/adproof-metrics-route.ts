/**
 * adProof Pilot-Metriken-Endpoint (ADPROOF_MODE=1)
 *
 * GET /adproof/metrics
 * Liefert aggregierte Pilot-Metriken für das Dashboard-HTML.
 *
 * In-Memory-Store ist bewusst inline (kein Cross-Package-Import aus
 * adProof src/telemetry/) — identisches Muster wie adproof-coverage-route.ts.
 *
 * Aktuell leerer Store bis das Event-Wiring in #17 (INT-2) implementiert ist.
 * Event-Schreiben: wenn Bridge-Tools + Skill-Runner verdrahtet sind, rufen
 * sie recordServerMetric() auf (oder posten via HTTP falls Out-of-Process).
 *
 * Issue #24 — PILOT-1
 */
import { Router, type Request, type Response } from 'express';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PilotMetricName =
  | 'time_per_chapter_minutes'
  | 'reviewer_findings_count'
  | 'provenance_click_rate'
  | 'ai_with_source_selection_rate';

const ALL_METRIC_NAMES: readonly PilotMetricName[] = [
  'time_per_chapter_minutes',
  'reviewer_findings_count',
  'provenance_click_rate',
  'ai_with_source_selection_rate',
];

type MetricType = 'histogram' | 'rate';

const METRIC_TYPE: Record<PilotMetricName, MetricType> = {
  time_per_chapter_minutes: 'histogram',
  reviewer_findings_count: 'histogram',
  provenance_click_rate: 'rate',
  ai_with_source_selection_rate: 'rate',
};

interface MetricSample {
  name: PilotMetricName;
  value: number;
  labels?: Record<string, string>;
  ts: number;
}

interface MetricAggregate {
  count: number;
  sum?: number;     // histogram-Typ
  rate?: number;    // rate-Typ (Durchschnitt)
  values: number[]; // letzte ≤20 Werte für Sparkline
}

// ---------------------------------------------------------------------------
// In-Memory Store
// ---------------------------------------------------------------------------

const MAX_VALUES = 20;
const _samples: MetricSample[] = [];

/** Zeichnet ein neues Pilot-Metriken-Sample auf. */
export function recordServerMetric(
  name: PilotMetricName,
  value: number,
  labels?: Record<string, string>,
): void {
  _samples.push({ name, value, labels, ts: Date.now() });
}

function aggregateMetrics(
  samples: MetricSample[],
): Record<PilotMetricName, MetricAggregate> {
  const result = {} as Record<PilotMetricName, MetricAggregate>;

  for (const name of ALL_METRIC_NAMES) {
    const mine = samples.filter((s) => s.name === name);
    const values = mine.slice(-MAX_VALUES).map((s) => s.value);
    const count = mine.length;

    if (METRIC_TYPE[name] === 'rate') {
      const rate = count > 0 ? mine.reduce((acc, s) => acc + s.value, 0) / count : 0;
      result[name] = { count, rate, values };
    } else {
      const sum = mine.reduce((acc, s) => acc + s.value, 0);
      result[name] = { count, sum, values };
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createAdProofMetricsRouter(): Router {
  const router = Router();

  router.get('/adproof/metrics', (_req: Request, res: Response) => {
    res.json({
      success: true,
      metrics: aggregateMetrics(_samples),
      sampleCount: _samples.length,
      // Hinweis: Samples sind leer bis Event-Wiring in #17 (INT-2) implementiert ist.
      wireStatus: 'pending-int2',
    });
  });

  return router;
}
