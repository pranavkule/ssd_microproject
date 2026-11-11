import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const args = process.argv.slice(2);
const positional = [];
const options = {};

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument.startsWith('--')) {
    const key = argument.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      console.error(`Missing value for --${key}.`);
      process.exit(2);
    }
    options[key] = value;
    index += 1;
  } else {
    positional.push(argument);
  }
}

const [directTarget, countText = '50', concurrencyText = '5'] = positional;
const count = Number(countText);
const concurrency = Number(concurrencyText);
const allowedOptions = new Set(['gateway-url', 'token', 'output']);

if (Object.keys(options).some((key) => !allowedOptions.has(key))) {
  console.error('Supported options: --gateway-url <base-url> --token <JWT> --output <file>');
  process.exit(2);
}
if (!directTarget) {
  console.error('Usage: node deployment/scripts/benchmark.mjs <direct-GET-url> [requests<=200] [concurrency<=10] [--gateway-url <base-url> --token <JWT>] [--output <file>]');
  process.exit(2);
}

function parseHttpUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    console.error(`${label} must be a valid absolute URL.`);
    process.exit(2);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    console.error(`${label} must use HTTP or HTTPS and must not contain credentials.`);
    process.exit(2);
  }
  return url;
}

if (!Number.isInteger(count) || count < 1 || count > 200) {
  console.error('Request count must be an integer from 1 to 200.');
  process.exit(2);
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) {
  console.error('Concurrency must be an integer from 1 to 10.');
  process.exit(2);
}

const directUrl = parseHttpUrl(directTarget, 'Direct target');
const scenarios = [{ name: 'Direct backend', url: directUrl, headers: {} }];

if (options['gateway-url'] || options.token) {
  if (!options['gateway-url'] || !options.token) {
    console.error('Gateway comparison requires both --gateway-url and --token.');
    process.exit(2);
  }
  const gatewayBase = parseHttpUrl(options['gateway-url'], 'Gateway base URL');
  if (gatewayBase.pathname !== '/' || gatewayBase.search || gatewayBase.hash) {
    console.error('Gateway base URL must contain only an origin (for example http://localhost:8000).');
    process.exit(2);
  }
  const gatewayUrl = new URL(`${directUrl.pathname}${directUrl.search}`, gatewayBase);
  scenarios.push(
    { name: 'Gateway without JWT', url: gatewayUrl, headers: {} },
    { name: 'Gateway with JWT', url: gatewayUrl, headers: { Authorization: `Bearer ${options.token}` } }
  );
}

async function runScenario(scenario) {
  const durations = [];
  const statusCounts = new Map();
  let nextIndex = 0;
  let successfulRequests = 0;
  let failedRequests = 0;
  const startedAt = performance.now();

  async function worker() {
    while (true) {
      const requestIndex = nextIndex++;
      if (requestIndex >= count) return;

      const requestStartedAt = performance.now();
      try {
        const response = await fetch(scenario.url, {
          method: 'GET',
          headers: scenario.headers,
          signal: AbortSignal.timeout(10000),
        });
        await response.arrayBuffer();
        durations.push(performance.now() - requestStartedAt);
        statusCounts.set(response.status, (statusCounts.get(response.status) || 0) + 1);
        if (response.ok) successfulRequests += 1;
        else failedRequests += 1;
      } catch (error) {
        durations.push(performance.now() - requestStartedAt);
        failedRequests += 1;
        console.error(`${scenario.name} request ${requestIndex + 1} failed: ${error.name}`);
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(concurrency, count) },
    () => worker()
  ));

  const elapsedMs = performance.now() - startedAt;
  durations.sort((left, right) => left - right);
  const percentile = (fraction) => durations[Math.ceil(durations.length * fraction) - 1] || 0;
  const average = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
  const result = {
    name: scenario.name,
    target: scenario.url.origin + scenario.url.pathname,
    method: 'GET',
    totalRequests: count,
    successfulRequests,
    failedRequests,
    concurrency,
    durationMs: Number(elapsedMs.toFixed(2)),
    requestsPerSecond: Number((count / (elapsedMs / 1000)).toFixed(2)),
    averageResponseTimeMs: Number(average.toFixed(2)),
    p50LatencyMs: Number(percentile(0.5).toFixed(2)),
    p95LatencyMs: Number(percentile(0.95).toFixed(2)),
    p99LatencyMs: Number(percentile(0.99).toFixed(2)),
    statusCounts: Object.fromEntries([...statusCounts.entries()].sort((a, b) => a[0] - b[0])),
  };
  return {
    ...result,
    requests: result.totalRequests,
    failures: result.failedRequests,
    throughputRequestsPerSecond: result.requestsPerSecond,
    averageLatencyMs: result.averageResponseTimeMs,
    p50LatencyMs: result.p50LatencyMs,
    p95LatencyMs: result.p95LatencyMs,
  };
}

const results = [];
for (const scenario of scenarios) {
  results.push(await runScenario(scenario));
}

if (results.length === 1) {
  console.log(JSON.stringify(results[0], null, 2));
} else {
  console.log(`Benchmark: ${count} GET requests per scenario, concurrency ${concurrency}`);
  console.table(results.map((result) => ({
    Scenario: result.name,
    Total: result.totalRequests,
    Successful: result.successfulRequests,
    Failed: result.failedRequests,
    'Requests/sec': result.requestsPerSecond,
    'Average ms': result.averageResponseTimeMs,
    'p50 ms': result.p50LatencyMs,
    'p95 ms': result.p95LatencyMs,
    'p99 ms': result.p99LatencyMs,
  })));
}

const outputPath = path.resolve(options.output || 'benchmark-results.json');
const report = {
  generatedAt: new Date().toISOString(),
  workload: { method: 'GET', requestsPerScenario: count, concurrency },
  results,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const outputMessage = `JSON results written to ${outputPath}`;
if (results.length === 1) console.error(outputMessage);
else console.log(outputMessage);

if (results.some((result) => result.failedRequests > 0)) process.exitCode = 1;
