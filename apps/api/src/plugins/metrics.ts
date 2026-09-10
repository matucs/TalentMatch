import { collectDefaultMetrics, Histogram, Registry } from 'prom-client';
import type { ApiInstance } from '../types.js';

export interface Metrics {
  readonly registry: Registry;
  readonly requestDuration: Histogram<'method' | 'route' | 'status_code'>;
}

export function createMetrics(): Metrics {
  const registry = new Registry();
  registry.setDefaultLabels({ service: 'talentmatch-api' });
  collectDefaultMetrics({ register: registry, prefix: 'talentmatch_' });
  const requestDuration = new Histogram({
    name: 'talentmatch_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });
  return { registry, requestDuration };
}

export function registerMetricsRoute(app: ApiInstance, metrics: Metrics): void {
  app.get('/metrics', {
    schema: { hide: true },
  }, async (_request, reply) => {
    void reply.header('content-type', metrics.registry.contentType);
    return metrics.registry.metrics();
  });
}
