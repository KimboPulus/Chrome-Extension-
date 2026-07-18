# Compatibility evidence

## Automated target

GitHub Actions builds extension and runs Playwright against bundled Chromium.
Smoke covers loading unpacked MV3 extension, popup/options/side-panel flows,
blocking behavior, persistence, and accessibility checks. Unit and integration
tests cover domain normalization, storage migration, policy evaluation, timing,
analytics, and manifest paths.

## Supported browser family

Release targets current desktop Google Chrome and Chromium browsers supporting
Manifest V3 APIs used by manifest. Microsoft Edge may load package because it is
Chromium-based, but Edge is not part of automated matrix. Firefox and Safari are
not supported.

## Manual checks before release

1. Load generated `dist` directory in current stable Chrome.
2. Confirm popup records active interaction but not background tabs.
3. Confirm media time stops on pause and screen lock.
4. Confirm permanent and daily-limit blocks show extension block page.
5. Restart browser and confirm totals/settings persist without time jump.
6. Export data and inspect file locally.

GitHub package and SHA-256 checksum prove source packaging, not Chrome Web Store
review. Repository currently distributes GitHub release ZIP; no store listing is
claimed.
