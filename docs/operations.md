# Operations runbook

## Signals

- ALB target 5xx count and p95 response time have CloudWatch alarms routed to the configured SNS topic.
- ECS Container Insights captures service CPU, memory, desired count, and running count.
- API `/metrics` exposes Node.js process metrics and HTTP duration histograms with method, route, and status labels.
- Rate-limited responses expose remaining quota and retry timing; Redis limiter failures emit structured warning logs and fail open.
- API completion logs carry `requestId`, method, URL, duration, and status.
- Worker completion logs carry BullMQ job ID, job name, attempt, and duration.

Never alert on liveness dependency failures: liveness deliberately ignores dependencies. Alert on readiness failures, ALB unhealthy hosts, queue age, DLQ size, and managed-service health.

## Indexing or scoring backlog

1. Check MongoDB, Redis, and OpenSearch health before scaling workers.
2. Inspect worker logs for retryable connection errors versus deterministic mapping/data errors.
3. Compare BullMQ waiting, active, delayed, and failed counts.
4. Increase worker desired count only when dependencies have spare capacity.
5. Acknowledge that CPU autoscaling may not react to a mostly I/O-bound queue; queue-age metrics are the intended improvement.

## Dead-letter queues

- `job-indexing-dead-letter`
- `application-scoring-dead-letter`

The original exhausted jobs are retained in their source queues and a diagnostic copy is placed in the DLQ. Inspect mode is the default:

```bash
pnpm dlq index --limit=100
pnpm dlq score --limit=100
```

Before replay:

1. Identify and fix the underlying dependency, mapping, or data error.
2. Preserve the command's original event ID. Application scoring requires it to match the MongoDB score marker.
3. Run `pnpm dlq index --limit=100 --execute` or `pnpm dlq score --limit=100 --execute`.
4. Confirm indexing cache invalidation or application transition to `scored`.
5. Keep an audit record of operator, reason, command ID, and outcome.

Do not blindly drain a DLQ: deterministic errors will immediately consume retries again.

The CLI validates every DLQ payload. It preserves the event ID, replaces only a failed source job, treats active/waiting/completed commands as already scheduled, and leaves unknown states untouched. Its operation order is crash-safe: the DLQ copy remains until source scheduling succeeds.

## Reindexing

Run `pnpm reindex` from a one-off task with the worker service healthy. The current MVP command clears the live index and enqueues every published MongoDB job. Search results are incomplete during this window. For larger production datasets, replace this with a versioned index, count validation, and atomic alias swap.

## Dependency outage behavior

- MongoDB outage: readiness fails; job and application writes cannot proceed. Workers retain queued work.
- Redis outage: readiness fails. MongoDB mutations retain pending outbox markers, which relays deliver after recovery.
- Rate limiting during Redis outage: requests continue without quota enforcement until Redis recovers.
- OpenSearch outage: readiness fails and search is unavailable. Index jobs retry and eventually enter the DLQ; MongoDB remains authoritative.
- Cache-only Redis errors: search degrades to OpenSearch, but the shared Redis deployment also hosts BullMQ, so prolonged failure affects asynchronous delivery.

## Secret rotation

After rotating a Secrets Manager value, force a new ECS deployment because ECS injects secrets only at task startup. Verify readiness and queue processing before terminating the previous tasks.
