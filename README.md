# Focus Meter

Focus Meter is a Chrome extension that tracks active browsing time and blocks websites after a daily limit is reached.

![Dashboard overview](/images/overview.png)
![Dashboard overview](/images/overview2.png)

## Features

- Counts time while a page is visible and recently used
- Keeps counting when visible video or audio is playing in the active tab
- Requires Chrome window focus for interaction tracking
- Stops interaction tracking when the computer is idle and all tracking when it is locked
- Shows today's usage in the popup
- Supports permanently blocked websites
- Supports daily time limits
- Clears limit-based blocks on a new local day
- Stores all settings and usage data locally

## Install

1. Download or clone this repository.
2. Run `npm ci` and `npm run build`.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the generated `dist` folder.

The extension starts tracking normal `http` and `https` pages after it is loaded.

## Settings

Open the extension popup and click **Open settings**.

Blocked websites can be separated by lines, commas, or spaces. Daily limits and the idle threshold are displayed in minutes. The default idle threshold is 30 minutes, and it can be set from 0.25 minutes up to 1440 minutes. Domains can be entered as `youtube.com` or as a full URL; they are normalized before saving.

## How tracking works

The content script watches for recent keyboard, pointer, scrolling, and touch activity. It sends a pulse every five seconds while the page is visible and recently active. It also sends media pulses while a visible tab is playing video or audio.

The background service worker counts an interaction pulse only when:

- the sending tab is still active,
- its Chrome window is focused,
- the computer is active,
- and the URL is a normal website.

Media pulses are allowed to keep counting when Chrome loses focus or the computer becomes idle, as long as playback continues, the tab remains active, the page is visible, and the screen is not locked. Each recorded increment is capped at ten seconds. This prevents large time jumps after sleep, browser suspension, or a service worker restart.

## Privacy

Browsing totals and settings are stored with `chrome.storage.local`. In-progress tracking state uses `chrome.storage.session` so service-worker restarts do not bridge or lose active intervals. The extension does not send browsing data to a server. Export happens only after a user clicks an export control.

## Development

Run the checks with:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run package
```

## Current limitations

- Media playback is detected through standard HTML video and audio elements. Custom players that do not expose one may require site-specific support.
- Incognito tracking is intentionally disabled.
- Recurring schedule transitions are enforced by a one-minute alarm, so a boundary can take up to one minute to apply.
