#!/usr/bin/env node
// Builds workflow.json (the file you import into n8n) from nodes/filter_dedupe.js,
// so the code you read and test is exactly the code that ships.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'nodes', 'filter_dedupe.js'), 'utf8');

const assign = (id, name, value, type = 'string') => ({ id, name, value, type });

const workflow = {
  name: 'News alerts (RSS to Telegram)',
  nodes: [
    {
      parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 30 }] } },
      id: 'a1000000-0000-4000-8000-000000000001',
      name: 'Every 30 minutes',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [0, 0],
    },
    {
      parameters: {},
      id: 'a1000000-0000-4000-8000-000000000002',
      name: 'Run manually (test)',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [0, 200],
    },
    {
      parameters: {
        assignments: {
          assignments: [
            assign('c1', 'feed_url', 'PASTE_FEED_URL_HERE'),
            assign('c2', 'source_label', 'News'),
            assign('c3', 'keywords', ''),
            assign('c4', 'max_items_per_run', 5, 'number'),
            assign('c5', 'first_run_send', 3, 'number'),
            assign('c6', 'telegram_chat_id', 'YOUR_CHAT_ID'),
          ],
        },
        options: {},
      },
      id: 'a1000000-0000-4000-8000-000000000003',
      name: 'Config',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [260, 100],
      notes: 'All settings live here. keywords: comma separated, empty = everything.',
      notesInFlow: true,
    },
    {
      parameters: { url: '={{ $json.feed_url }}', options: {} },
      id: 'a1000000-0000-4000-8000-000000000004',
      name: 'Read RSS feed',
      type: 'n8n-nodes-base.rssFeedRead',
      typeVersion: 1.1,
      position: [520, 100],
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 5000,
    },
    {
      parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: code },
      id: 'a1000000-0000-4000-8000-000000000005',
      name: 'New items only',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [780, 100],
    },
    {
      parameters: {
        chatId: "={{ $('Config').first().json.telegram_chat_id }}",
        text: '={{ $json.message }}',
        additionalFields: { appendAttribution: false, disable_web_page_preview: true },
      },
      id: 'a1000000-0000-4000-8000-000000000006',
      name: 'Send to Telegram',
      type: 'n8n-nodes-base.telegram',
      typeVersion: 1.2,
      position: [1040, 100],
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 5000,
      credentials: { telegramApi: { id: '', name: 'Telegram bot' } },
    },
  ],
  connections: {
    'Every 30 minutes': { main: [[{ node: 'Config', type: 'main', index: 0 }]] },
    'Run manually (test)': { main: [[{ node: 'Config', type: 'main', index: 0 }]] },
    Config: { main: [[{ node: 'Read RSS feed', type: 'main', index: 0 }]] },
    'Read RSS feed': { main: [[{ node: 'New items only', type: 'main', index: 0 }]] },
    'New items only': { main: [[{ node: 'Send to Telegram', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
  pinData: {},
  active: false,
  tags: [],
};

const out = path.join(root, 'workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2) + '\n');
console.log('wrote', path.relative(process.cwd(), out));
