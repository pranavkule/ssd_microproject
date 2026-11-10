import assert from 'node:assert/strict';
import test from 'node:test';
import { getGatewayConnectionState } from '../src/utils/gatewayConnection.js';

test('reports connected when the gateway health endpoint responds', () => {
  const state = getGatewayConnectionState({
    health: { status: 'running' },
    error: '',
    gatewayUnavailable: false,
  });

  assert.equal(state.status, 'running');
  assert.equal(state.unavailable, false);
  assert.equal(state.sidebarLabel, 'Connected to gateway API');
});

test('reports disconnected when the gateway is unavailable', () => {
  const state = getGatewayConnectionState({
    health: { status: 'running' },
    error: 'Could not connect to the API gateway.',
    gatewayUnavailable: true,
  });

  assert.equal(state.status, 'offline');
  assert.equal(state.unavailable, true);
  assert.equal(state.sidebarLabel, 'Gateway disconnected');
});

test('reports checking before the first health response', () => {
  const state = getGatewayConnectionState({
    health: null,
    error: '',
    gatewayUnavailable: false,
  });

  assert.equal(state.status, 'checking');
  assert.equal(state.unavailable, false);
  assert.equal(state.sidebarLabel, 'Checking gateway connection');
});
