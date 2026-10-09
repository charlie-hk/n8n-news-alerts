'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const wf = JSON.parse(fs.readFileSync(path.join(root, 'workflow.json'), 'utf8'));

test('node names and ids are unique', () => {
  const names = wf.nodes.map((n) => n.name);
  const ids = wf.nodes.map((n) => n.id);
  assert.equal(new Set(names).size, names.length);
  assert.equal(new Set(ids).size, ids.length);
});

test('every connection points at an existing node', () => {
  const names = new Set(wf.nodes.map((n) => n.name));
  for (const [from, conn] of Object.entries(wf.connections)) {
    assert.ok(names.has(from), `unknown source ${from}`);
    for (const branch of conn.main) {
      for (const target of branch) assert.ok(names.has(target.node), `unknown target ${target.node}`);
    }
  }
});

test('both triggers lead into Config and the chain reaches Telegram', () => {
  assert.equal(wf.connections['Every 30 minutes'].main[0][0].node, 'Config');
  assert.equal(wf.connections['Run manually (test)'].main[0][0].node, 'Config');
  let node = 'Config';
  const walked = [];
  while (wf.connections[node]) {
    node = wf.connections[node].main[0][0].node;
    walked.push(node);
  }
  assert.deepEqual(walked, ['Read RSS feed', 'New items only', 'Send to Telegram']);
});

test('the Code node in workflow.json is exactly nodes/filter_dedupe.js', () => {
  const embedded = wf.nodes.find((n) => n.name === 'New items only').parameters.jsCode;
  assert.equal(embedded, fs.readFileSync(path.join(root, 'nodes', 'filter_dedupe.js'), 'utf8'));
});

test('workflow.json is up to date with the build script', () => {
  const before = fs.readFileSync(path.join(root, 'workflow.json'), 'utf8');
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build_workflow.js')], { stdio: 'ignore' });
  assert.equal(fs.readFileSync(path.join(root, 'workflow.json'), 'utf8'), before);
});

test('no secrets are stored in the workflow', () => {
  const text = JSON.stringify(wf);
  assert.ok(!/\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/.test(text), 'looks like a Telegram bot token');
  assert.equal(wf.nodes.find((n) => n.name === 'Send to Telegram').credentials.telegramApi.id, '');
  assert.equal(wf.active, false);
});

test('network nodes retry before failing', () => {
  for (const name of ['Read RSS feed', 'Send to Telegram']) {
    const node = wf.nodes.find((n) => n.name === name);
    assert.equal(node.retryOnFail, true);
    assert.ok(node.maxTries >= 3);
  }
});

test('the Config node holds every setting the code reads', () => {
  const config = wf.nodes.find((n) => n.name === 'Config').parameters.assignments.assignments.map((a) => a.name);
  for (const key of ['feed_url', 'keywords', 'max_items_per_run', 'first_run_send', 'source_label', 'telegram_chat_id']) {
    assert.ok(config.includes(key), `missing ${key}`);
  }
});
