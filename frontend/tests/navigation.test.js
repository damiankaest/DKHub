import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberRecent, toggleFavorite, loadIds } from '../src/navigation.js';

test('recent apps are unique, newest first and limited', () => {
  assert.deepEqual(rememberRecent(['a', 'b', 'c', 'd', 'e'], 'b'), ['b', 'a', 'c', 'd', 'e']);
  assert.deepEqual(rememberRecent(['a', 'b', 'c', 'd', 'e'], 'f'), ['f', 'a', 'b', 'c', 'd']);
});

test('favorites toggle without changing the previous list', () => {
  const before = ['a'];
  assert.deepEqual(toggleFavorite(before, 'b'), ['a', 'b']);
  assert.deepEqual(toggleFavorite(before, 'a'), []);
  assert.deepEqual(before, ['a']);
});

test('unavailable or malformed browser storage is handled', () => {
  assert.deepEqual(loadIds('x'), []);
  globalThis.localStorage = { getItem: () => '{bad' };
  assert.deepEqual(loadIds('x'), []);
  globalThis.localStorage = { getItem: () => '["a", 1, "b"]' };
  assert.deepEqual(loadIds('x'), ['a', 'b']);
  delete globalThis.localStorage;
});
