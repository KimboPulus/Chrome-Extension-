# Privacy notice

Focus Meter processes browsing activity on device to calculate time totals and
apply user-configured blocks.

## Data handled

- active website hostname;
- accumulated active/media time by local day;
- configured block list, time limits, schedules, and idle threshold;
- short-lived tracking checkpoints needed after service-worker restart.

## Storage and transmission

Persistent settings and totals use `chrome.storage.local`. In-progress tracking
state uses `chrome.storage.session`. Extension has no analytics SDK, remote API,
advertising integration, account system, or cloud synchronization. It does not
transmit browsing totals to repository owner or another server.

Export occurs only after user invokes export control. Removing extension clears
extension-owned browser storage according to Chrome behavior.

## Permissions

- site access lets content script observe interaction and standard media state;
- tabs/windows/idle information prevents counting background or locked use;
- storage keeps user settings and totals;
- alarms re-evaluate scheduled policies and local-day boundaries;
- declarative network request applies configured blocks.

Source code implementing these boundaries lives in `src/platform/chrome`,
`src/storage`, and `src/domain`. Privacy questions and reproducible violations
belong in GitHub issues; never attach exported browsing data publicly.
