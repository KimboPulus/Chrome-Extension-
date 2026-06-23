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
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this project folder.

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

Browsing totals and settings are stored with `chrome.storage.local`. The extension does not send browsing data to a server.

## Development

Run the checks with:

```bash
npm test
npm run check
```

## Current limitations

- Media playback is detected through standard HTML video and audio elements. Custom players that do not expose one may require site-specific support.
- Domain normalization strips common `www.` and `m.` prefixes but does not use a public suffix database.
- Incognito tracking is not enabled by default.
