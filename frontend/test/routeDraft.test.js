import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRouteDraft } from '../src/utils/routeDraft.js';

const validDraft = {
  name: 'Catalog API',
  path: '/catalog',
  description: '',
  methods: ['GET', 'HEAD'],
  stripPrefix: false,
  enabled: true,
  loadBalancingStrategy: 'round_robin',
  backendInstances: [
    { id: 'catalog-a', target: 'http://localhost:5010', enabled: true },
    { id: 'catalog-b', target: 'https://catalog.example.test', enabled: true },
  ],
};

test('accepts a valid route with multiple backend instances', () => {
  assert.deepEqual(validateRouteDraft(validDraft), {});
});

test('rejects reserved route prefixes and unsupported empty method sets', () => {
  const errors = validateRouteDraft({ ...validDraft, path: '/api/gateway/routes', methods: [] });
  assert.match(errors.path, /reserved gateway endpoint/i);
  assert.match(errors.methods, /at least one/i);
});

test('rejects invalid backend targets and duplicate backend IDs', () => {
  const errors = validateRouteDraft({
    ...validDraft,
    backendInstances: [
      { id: 'same', target: 'ftp://invalid.test', enabled: true },
      { id: 'same', target: 'http://localhost:5011?token=unsafe', enabled: true },
    ],
  });
  assert.match(errors['backend-0'], /HTTP or HTTPS/);
  assert.match(errors['backend-1'], /duplicated/i);
});
