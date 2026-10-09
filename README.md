# n8n news alerts: RSS to Telegram

An [n8n](https://n8n.io) workflow that watches any RSS news feed and sends **only new headlines** to a Telegram chat. It remembers what it has already sent, can filter by keyword, and never floods a fresh setup. Built with market news in mind (central-bank releases, FX and commodity news), but it works with any feed.

```
Every 30 min ─┐
              ├─> Config ─> Read RSS feed ─> New items only ─> Send to Telegram
Manual test ──┘                              (dedupe + filter)
```

## Why RSS and not page scraping

News sites usually restrict automated copying of their pages and republishing of their articles. This workflow therefore reads a publisher's **RSS feed**, the channel meant for machines, and forwards only the **headline, the link and the time**, with the source named. Article text is used locally for keyword matching and is never forwarded.

- Polling is every 30 minutes by default.
- Do not use this to republish or resell content, and do not feed it to AI training. Check the publisher's current terms for your use.

## Choosing a feed

Set `feed_url` to the address of a feed the publisher offers on its official RSS page. Two things to know:

- Some publishers' feeds need a paid subscription (HTTP 401), and some block automated readers (HTTP 403). If you get either, use a different source. Do not try to get around the block.
- A publisher's "RSS" page is usually a web page that lists the feeds. Copy the address of one specific feed from that list, not the address of the page.

## What is in the box

| File | Purpose |
|---|---|
| `workflow.json` | The workflow you import into n8n |
| `nodes/filter_dedupe.js` | The Code-node logic, readable and tested on its own |
| `scripts/build_workflow.js` | Builds `workflow.json` from the code file, so what you read is what ships |
| `tests/` | 22 automated tests (Node's built-in runner, no dependencies) |

## Setup

1. In n8n: open the workflows page, use the arrow next to **Create workflow** -> **Import from file** -> `workflow.json` (or open an empty workflow and paste the file's contents with Ctrl+V).
2. Open **Send to Telegram**, create a credential with the token from [@BotFather](https://t.me/BotFather).
3. Open **Config** and set `feed_url` and `telegram_chat_id`. Send `/start` to your bot first, otherwise Telegram refuses to deliver to you.
4. Click **Run manually (test)** once and check the chat.
5. **Activate** the workflow.

## Settings (node `Config`)

| Name | Default | Meaning |
|---|---|---|
| `feed_url` | `PASTE_FEED_URL_HERE` | An RSS or Atom feed you are allowed to use |
| `keywords` | empty | Comma separated, case-insensitive, matched on title, snippet and categories. Empty means everything |
| `max_items_per_run` | 5 | Upper bound per run; if more new items arrive, the newest are sent |
| `first_run_send` | 3 | On the very first run only this many are sent, so a new setup does not flood the chat |
| `source_label` | News | Shown in each message (set it to the publisher's name) |
| `telegram_chat_id` | `YOUR_CHAT_ID` | Where alerts go |

## How de-duplication works

The Code node stores the ids (`guid`, or the link when there is none) of the last 1000 items it has looked at, in n8n's workflow static data. Items that were filtered out by keywords or cut by the cap are remembered too, so changing the keywords later does not resurrect old news. Alerts are sent oldest first, so the chat reads in order.

## Good to know

- n8n keeps static data only for **activated** workflows. A manual test run does not save the remembered list, so repeated manual runs can resend the same items. That is expected.
- n8n's RSS node returns the standard fields only; publisher-specific fields are not used.
- This sends news headlines. It is not trading advice, and nothing here places trades.

## Tests

```
npm test
```

Covers the first run, repeat runs, a new item arriving later, keyword matching, the caps, duplicate ids, bad dates and bad settings, plus checks that `workflow.json` is consistent (connections, no secrets, in sync with the code file).

The automated tests run the Code-node logic with simulated n8n inputs. The workflow was also run end to end by hand on a local n8n instance (feed read, filter, Telegram message).

## Licence

MIT
