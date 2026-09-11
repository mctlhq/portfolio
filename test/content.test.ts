import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPublic, publicEntries } from '../src/lib/content.ts';

test('isPublic returns true only for visibility: public', () => {
  assert.equal(isPublic({ data: { visibility: 'public' } }), true);
  assert.equal(isPublic({ data: { visibility: 'private' } }), false);
});

test('publicEntries keeps only public entries and preserves input order', () => {
  const entries = [
    { id: 'a', data: { visibility: 'public' } },
    { id: 'b', data: { visibility: 'private' } },
    { id: 'c', data: { visibility: 'public' } },
  ];
  assert.deepEqual(
    publicEntries(entries).map((e) => e.id),
    ['a', 'c'],
  );
});

test('publicEntries returns a new array, not the input array', () => {
  const entries = [{ id: 'a', data: { visibility: 'public' as const } }];
  const result = publicEntries(entries);
  assert.notEqual(result, entries);
});

test('publicEntries returns [] for an all-private input', () => {
  const entries = [
    { id: 'a', data: { visibility: 'private' as const } },
    { id: 'b', data: { visibility: 'private' as const } },
  ];
  assert.deepEqual(publicEntries(entries), []);
});
