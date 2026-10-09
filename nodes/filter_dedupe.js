// n8n Code node, mode "Run Once for All Items".
// Keeps only NEW feed items that match the keyword list, and shapes them into alert messages.
// Only the headline, the link and the time leave this node: article text is never forwarded.
// The same file is embedded into workflow.json by scripts/build_workflow.js and covered by tests/.

const cfg = $('Config').first().json;
const keywords = String(cfg.keywords || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const maxPerRun = Number.isFinite(Number(cfg.max_items_per_run)) && Number(cfg.max_items_per_run) > 0
  ? Math.floor(Number(cfg.max_items_per_run))
  : 5;
const firstRunSend = Number.isFinite(Number(cfg.first_run_send)) && Number(cfg.first_run_send) >= 0
  ? Math.floor(Number(cfg.first_run_send))
  : 3;
const SOURCE = String(cfg.source_label || 'News');
const SEEN_LIMIT = 1000;

const state = $getWorkflowStaticData('global');
const seen = new Set(Array.isArray(state.seen) ? state.seen : []);
const firstRun = !state.initialized;

const toMillis = (value) => {
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
};

// 1. Normalise the feed items (ignore anything without a title and a link).
const items = $input
  .all()
  .map((entry) => entry.json)
  .filter((j) => j && j.title && j.link)
  .map((j) => {
    const time = j.isoDate || j.pubDate || '';
    return {
      id: String(j.guid || j.id || j.link),
      title: String(j.title).trim(),
      link: String(j.link).trim(),
      time,
      millis: toMillis(time),
      // used for keyword matching only, never forwarded
      haystack: `${j.title} ${j.contentSnippet || ''} ${[].concat(j.categories || []).join(' ')}`.toLowerCase(),
    };
  })
  .sort((a, b) => b.millis - a.millis); // newest first

// 2. Keep what we have not seen before; the same id twice in one feed counts once.
const fresh = [];
const batchIds = new Set();
for (const item of items) {
  if (seen.has(item.id) || batchIds.has(item.id)) continue;
  batchIds.add(item.id);
  fresh.push(item);
}

// 3. Remember everything we looked at, matching or not, so it is never reconsidered.
state.seen = [...seen, ...fresh.map((i) => i.id)].slice(-SEEN_LIMIT);
state.initialized = true;

// 4. Keyword filter, then the per-run cap (the first run is capped lower so a new setup does not flood the chat).
const matching = keywords.length
  ? fresh.filter((i) => keywords.some((k) => i.haystack.includes(k)))
  : fresh;
const limit = firstRun ? firstRunSend : maxPerRun;
const selected = matching.slice(0, limit).reverse(); // oldest first, so the chat reads in order

const stamp = (t) => {
  const ms = toMillis(t);
  return ms ? `${new Date(ms).toISOString().replace('T', ' ').slice(0, 16)} UTC` : '';
};

return selected.map((i) => ({
  json: {
    title: i.title,
    link: i.link,
    time: i.time,
    message: [i.title, i.link, [stamp(i.time), `Source: ${SOURCE}`].filter(Boolean).join(' | ')].join('\n'),
  },
}));
