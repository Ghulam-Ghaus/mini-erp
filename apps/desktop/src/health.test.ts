import http from 'node:http';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { findFreePort } from './free-port.js';
import { HealthTimeoutError, waitForHealth } from './health.js';

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

function startServer(handler: http.RequestListener, port: number): Promise<void> {
  const server = http.createServer(handler);
  servers.push(server);
  return new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
}

const body = (status: 'ok' | 'error', db: 'up' | 'down') =>
  JSON.stringify({ status, db, version: '0.1.0', timestamp: new Date().toISOString() });

describe('findFreePort', () => {
  it('returns a port that can be bound', async () => {
    const port = await findFreePort();
    expect(port).toBeGreaterThan(0);
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    await new Promise((r) => server.close(r));
  });
});

describe('waitForHealth', () => {
  it('waits until the API reports ok', async () => {
    const port = await findFreePort();
    let calls = 0;
    await startServer((_req, res) => {
      calls += 1;
      const healthy = calls >= 3;
      res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
      res.end(body(healthy ? 'ok' : 'error', healthy ? 'up' : 'down'));
    }, port);

    const result = await waitForHealth({
      url: `http://127.0.0.1:${port}/health`,
      timeoutMs: 5000,
      intervalMs: 20,
    });
    expect(result.status).toBe('ok');
    expect(calls).toBe(3);
  });

  it('times out with the last status when the database stays down', async () => {
    const port = await findFreePort();
    await startServer((_req, res) => {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(body('error', 'down'));
    }, port);

    const promise = waitForHealth({
      url: `http://127.0.0.1:${port}/health`,
      timeoutMs: 200,
      intervalMs: 20,
    });
    await expect(promise).rejects.toBeInstanceOf(HealthTimeoutError);
    await expect(promise).rejects.toMatchObject({ lastStatus: 'HTTP 503, database down' });
  });

  it('stops early when asked to abort', async () => {
    const port = await findFreePort(); // nothing listening
    await expect(
      waitForHealth({
        url: `http://127.0.0.1:${port}/health`,
        timeoutMs: 5000,
        intervalMs: 20,
        shouldAbort: () => 'API process exited',
      }),
    ).rejects.toThrow('API process exited');
  });
});
