import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('./benchmark.mjs', import.meta.url));

function runBenchmark(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('benchmark runs matched direct and gateway scenarios and writes JSON results', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ method: req.method, authorization: req.headers.authorization || null }));
  });
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gateway-benchmark-test-'));
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const output = path.join(directory, 'results.json');
    const result = await runBenchmark([
      `${origin}/api/users`,
      '3',
      '2',
      '--gateway-url',
      origin,
      '--token',
      'test-token',
      '--output',
      output,
    ]);

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Direct backend/);
    assert.match(result.stdout, /Gateway without JWT/);
    assert.match(result.stdout, /Gateway with JWT/);
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.deepEqual(report.results.map((item) => item.totalRequests), [3, 3, 3]);
    assert.deepEqual(report.results.map((item) => item.successfulRequests), [3, 3, 3]);
    for (const scenario of report.results) {
      assert.equal(scenario.failedRequests, 0);
      assert.ok(scenario.requestsPerSecond > 0);
      assert.ok(scenario.averageResponseTimeMs >= 0);
      assert.ok(scenario.p99LatencyMs >= scenario.p50LatencyMs);
    }

    const legacyOutput = path.join(directory, 'legacy.json');
    const legacyRun = await runBenchmark([
      `${origin}/api/users`,
      '2',
      '1',
      '--output',
      legacyOutput,
    ]);
    assert.equal(legacyRun.code, 0, legacyRun.stderr);
    const legacySummary = JSON.parse(legacyRun.stdout);
    assert.equal(legacySummary.requests, 2);
    assert.equal(legacySummary.failures, 0);
    assert.ok(legacySummary.throughputRequestsPerSecond > 0);
    assert.ok(legacySummary.p99LatencyMs >= 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
