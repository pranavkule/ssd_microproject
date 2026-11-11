import { performance } from 'node:perf_hooks';

const [target, countText = '50', concurrencyText = '5'] = process.argv.slice(2);
const count = Number(countText);
const concurrency = Number(concurrencyText);

if (!target) {
  console.error('Usage: node deployment/scripts/benchmark.mjs <GET-url> [requests<=200] [concurrency<=10]');
  process.exit(2);
}

let targetUrl;
try {
  targetUrl = new URL(target);
} catch {
  console.error('Target must be a valid absolute URL.');
  process.exit(2);
}

if (!['http:', 'https:'].includes(targetUrl.protocol) || targetUrl.username || targetUrl.password) {
  console.error('Target must use HTTP or HTTPS and must not contain credentials.');
  process.exit(2);
}

if (!Number.isInteger(count) || count < 1 || count > 200) {
  console.error('Request count must be an integer from 1 to 200.');
  process.exit(2);
}

if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) {
  console.error('Concurrency must be an integer from 1 to 10.');
  process.exit(2);
}

const durations = [];
const statusCounts = new Map();
let nextIndex = 0;
let failures = 0;
const startedAt = performance.now();

async function worker() {
  while (true) {
    const requestIndex = nextIndex++;
    if (requestIndex >= count) return;

    const requestStartedAt = performance.now();
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });
      await response.arrayBuffer();
      durations.push(performance.now() - requestStartedAt);
      statusCounts.set(response.status, (statusCounts.get(response.status) || 0) + 1);
      if (!response.ok) failures++;
    } catch (error) {
      durations.push(performance.now() - requestStartedAt);
      failures++;
      console.error(`Request ${requestIndex + 1} failed: ${error.name}`);
    }
  }
}

await Promise.all(
  Array.from({ length: Math.min(concurrency, count) }, () => worker())
);

const elapsedMs = performance.now() - startedAt;
durations.sort((left, right) => left - right);
const percentile = (fraction) => durations[Math.ceil(durations.length * fraction) - 1] || 0;
const average = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;

console.log(JSON.stringify({
  target: targetUrl.origin + targetUrl.pathname,
  method: 'GET',
  requests: count,
  concurrency,
  durationMs: Number(elapsedMs.toFixed(2)),
  throughputRequestsPerSecond: Number((count / (elapsedMs / 1000)).toFixed(2)),
  averageLatencyMs: Number(average.toFixed(2)),
  p50LatencyMs: Number(percentile(0.5).toFixed(2)),
  p95LatencyMs: Number(percentile(0.95).toFixed(2)),
  failures,
  statusCounts: Object.fromEntries([...statusCounts.entries()].sort((a, b) => a[0] - b[0])),
}, null, 2));

if (failures > 0) process.exitCode = 1;
