'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'nodes', 'filter_dedupe.js'), 'utf8');

// Runs the Code-node body with the three globals n8n provides.
function runNode(feedItems, config = {}, state = {}) {
  const cfg = { keywords: '', max_items_per_run: 5, first_run_send: 3, source_label: 'News', ...config };
  const $ = (name) => {
    assert.equal(name, 'Config');
    return { first: () => ({ json: cfg }) };
  };
  const $input = { all: () => feedItems.map((json) => ({ json })) };
  const fn = new Function('$', '$input', '$getWorkflowStaticData', code);
  return fn($, $input, () => state);
}

const item = (n, extra = {}) => ({
  guid: `guid-${n}`,
  title: `Headline ${n}`,
  link: `https://example.com/news/${n}`,
  isoDate: new Date(Date.UTC(2026, 9, 9, 8, n)).toISOString(),
  contentSnippet: `Body text ${n}`,
  ...extra,
});

test('first run sends only the newest first_run_send items, oldest of them first', () => {
  const state = {};
  const out = runNode([item(1), item(2), item(3), item(4), item(5)], { first_run_send: 3 }, state);
  assert.deepEqual(out.map((o) => o.json.title), ['Headline 3', 'Headline 4', 'Headline 5']);
  assert.equal(state.initialized, true);
  assert.equal(state.seen.length, 5, 'all items are remembered, also the ones not sent');
});

test('second run with the same feed sends nothing', () => {
  const state = {};
  const feed = [item(1), item(2), item(3)];
  runNode(feed, {}, state);
  assert.deepEqual(runNode(feed, {}, state), []);
});

test('a new item after the first run is sent exactly once', () => {
  const state = {};
  runNode([item(1), item(2)], {}, state);
  const out = runNode([item(1), item(2), item(3)], {}, state);
  assert.deepEqual(out.map((o) => o.json.title), ['Headline 3']);
  assert.deepEqual(runNode([item(1), item(2), item(3)], {}, state), []);
});

test('keyword filter matches title, snippet and categories, case-insensitive', () => {
  const state = { initialized: true };
  const feed = [
    item(1, { title: 'ECB holds rates' }),
    item(2, { title: 'Quiet session', contentSnippet: 'Gold steady' }),
    item(3, { title: 'Other', categories: ['Central Banks', 'Fed'] }),
    item(4, { title: 'Unrelated' }),
  ];
  const out = runNode(feed, { keywords: ' ecb, GOLD ,fed ' }, state);
  assert.deepEqual(out.map((o) => o.json.title).sort(), ['ECB holds rates', 'Other', 'Quiet session']);
});

test('items that do not match are still remembered, so they never come back later', () => {
  const state = { initialized: true };
  const feed = [item(1, { title: 'Unrelated' })];
  assert.deepEqual(runNode(feed, { keywords: 'ecb' }, state), []);
  assert.deepEqual(runNode(feed, { keywords: '' }, state), [], 'changing the keywords does not resurrect old items');
});

test('per-run cap keeps the newest items', () => {
  const state = { initialized: true };
  const feed = [1, 2, 3, 4, 5, 6, 7].map((n) => item(n));
  const out = runNode(feed, { max_items_per_run: 2 }, state);
  assert.deepEqual(out.map((o) => o.json.title), ['Headline 6', 'Headline 7']);
});

test('the same guid twice in one feed is sent once', () => {
  const state = { initialized: true };
  const out = runNode([item(1), item(1)], {}, state);
  assert.equal(out.length, 1);
});

test('items without a guid fall back to the link as identity', () => {
  const state = { initialized: true };
  const a = { title: 'No guid', link: 'https://example.com/x', isoDate: '2026-10-09T08:00:00.000Z' };
  assert.equal(runNode([a], {}, state).length, 1);
  assert.equal(runNode([a], {}, state).length, 0);
});

test('items without title or link are ignored', () => {
  const state = { initialized: true };
  const out = runNode([{ guid: 'x', title: 'No link' }, { guid: 'y', link: 'https://e.com' }, item(1)], {}, state);
  assert.equal(out.length, 1);
});

test('a bad date does not crash and does not print a timestamp', () => {
  const state = { initialized: true };
  const out = runNode([item(1, { isoDate: 'not a date' })], {}, state);
  assert.equal(out.length, 1);
  assert.ok(!out[0].json.message.includes('UTC'));
});

test('message contains headline, link, time and source, but never the article text', () => {
  const state = { initialized: true };
  const out = runNode([item(1, { contentSnippet: 'SECRET ARTICLE BODY' })], { source_label: 'My Feed' }, state);
  const { message } = out[0].json;
  assert.ok(message.startsWith('Headline 1\nhttps://example.com/news/1\n'));
  assert.ok(message.includes('2026-10-09 08:01 UTC | Source: My Feed'));
  assert.ok(!JSON.stringify(out).includes('SECRET ARTICLE BODY'));
});

test('the remembered id list is capped at 1000', () => {
  const state = { initialized: true, seen: Array.from({ length: 1000 }, (_, i) => `old-${i}`) };
  runNode([item(1)], {}, state);
  assert.equal(state.seen.length, 1000);
  assert.equal(state.seen.at(-1), 'guid-1');
  assert.equal(state.seen[0], 'old-1');
});

test('bad config values fall back to safe defaults', () => {
  const state = {};
  const out = runNode([1, 2, 3, 4, 5, 6].map((n) => item(n)), { max_items_per_run: 'abc', first_run_send: -1 }, state);
  assert.equal(out.length, 3, 'invalid first_run_send falls back to 3');
  const out2 = runNode([7, 8, 9, 10, 11, 12, 13].map((n) => item(n)), { max_items_per_run: 'abc' }, state);
  assert.equal(out2.length, 5, 'invalid max_items_per_run falls back to 5');
});

test('an empty feed returns an empty list', () => {
  assert.deepEqual(runNode([], {}, {}), []);
});
