# Focus Meter

Focus Meter is a Chrome extension that tracks active browsing time and blocks websites after a daily limit is reached.

## Features

- Counts time only while a page is visible and recently used
- Checks that the Chrome window is focused
- Stops counting when the computer is idle or locked
- Shows today's usage in the popup
- Supports permanently blocked websites
- Supports daily time limits
- Clears limit-based blocks on a new local day
- Stores all settings and usage data locally

## Install

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this project folder.

The extension starts tracking normal `http` and `https` pages after it is loaded.

## Settings

Open the extension popup and click **Open settings**.

Blocked websites are entered one per line. Daily limits use minutes per day. Domains can be entered as `youtube.com` or as a full URL; they are normalized before saving.

## How tracking works

The content script watches for recent keyboard, pointer, scrolling, and touch activity. It sends a pulse every five seconds while the page is visible and recently active.

The background service worker counts a pulse only when:

- the sending tab is still active,
- its Chrome window is focused,
- the computer is active,
- and the URL is a normal website.

Each recorded increment is capped at ten seconds. This prevents large time jumps after sleep, browser suspension, or a service worker restart.

## Privacy

Browsing totals and settings are stored with `chrome.storage.local`. The extension does not send browsing data to a server.

## Development

Run the checks with:

```bash
npm test
npm run check
```

## Current limitations

- Tracking uses active interaction time only. Video foreground time is not included yet.
- Domain normalization strips common `www.` and `m.` prefixes but does not use a public suffix database.
- Incognito tracking is not enabled by default.

