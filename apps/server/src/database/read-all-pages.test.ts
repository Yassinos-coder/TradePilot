import assert from 'node:assert/strict';
import { readAllPages } from './read-all-pages';

async function main() {
  const source = Array.from({ length: 21904 }, (_, id) => ({ id }));
  // Simulate a server cap lower than the requested page size.
  const rows = await readAllPages(async (from, to) => ({
    data: source.slice(from, Math.min(from + 137, to + 1)), error: null,
  }));
  assert.deepEqual(rows, source);
  assert.deepEqual(await readAllPages(async () => ({ data: [], error: null })), []);
  await assert.rejects(readAllPages(async () => ({ data: null, error: { message: 'database unavailable' } })), /database unavailable/);
  console.log('Pagination regression checks passed');
}
void main();
