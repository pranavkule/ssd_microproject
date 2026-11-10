const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

async function findAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test(
  'gateway starts and reports an error registry when MongoDB is unavailable',
  { timeout: 20000 },
  async () => {
    const port = await findAvailablePort();
    const child = spawn(process.execPath, ['src/server.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        PORT: String(port),
        MONGODB_URI: 'mongodb://127.0.0.1:1/phase4_unavailable_test',
      },
      stdio: 'ignore',
    });

    try {
      const deadline = Date.now() + 15000;
      let healthResponse;

      while (Date.now() < deadline) {
        if (child.exitCode !== null) {
          throw new Error(`Gateway exited early with code ${child.exitCode}`);
        }

        try {
          healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
          break;
        } catch (error) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      assert.ok(healthResponse, 'gateway did not start before the deadline');
      assert.equal(healthResponse.status, 200);
      const health = await healthResponse.json();
      assert.equal(health.status, 'running');
      assert.equal(health.routeRegistry.status, 'error');

      const managementResponse = await fetch(
        `http://127.0.0.1:${port}/api/gateway/routes`
      );
      assert.equal(managementResponse.status, 503);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = new Promise((resolve) => child.once('exit', resolve));
        child.kill('SIGTERM');
        await Promise.race([
          exited,
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
      }
    }
  }
);
