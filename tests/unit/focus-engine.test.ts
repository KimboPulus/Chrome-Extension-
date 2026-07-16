import fc from "fast-check";
import {
  createInitialEngineState,
  reduceFocusEvent,
  splitSessionByLocalDay,
} from "../../src/domain/focus-engine";
import type { ActivityMode, FocusEngineState } from "../../src/domain/types";

function pulse(
  state: FocusEngineState,
  at: number,
  mode: ActivityMode = "interaction",
) {
  return reduceFocusEvent(state, {
    at,
    domain: "example.com",
    mode,
    tabId: 1,
    type: "ACTIVITY_PULSE",
    windowId: 10,
  });
}

describe("focus engine", () => {
  it("records only intervals between validated pulses", () => {
    const first = pulse(createInitialEngineState(), 1000);
    const second = pulse(first.state, 6000);

    expect(first.sessions).toEqual([]);
    expect(second.sessions).toEqual([
      expect.objectContaining({
        domain: "example.com",
        durationMs: 5000,
        endedAt: 6000,
        mode: "interaction",
        startedAt: 1000,
      }),
    ]);
  });

  it("caps gaps after suspension and attributes mode changes to prior interval", () => {
    const first = pulse(createInitialEngineState(), 1000, "media");
    const second = pulse(first.state, 31_000, "interaction");

    expect(second.sessions[0]).toEqual(
      expect.objectContaining({
        durationMs: 10_000,
        mode: "media",
        startedAt: 21_000,
      }),
    );
  });

  it("ignores duplicate and out-of-order events", () => {
    const first = pulse(createInitialEngineState(), 5000);
    const duplicate = pulse(first.state, 5000);
    const stale = pulse(duplicate.state, 4000);

    expect(duplicate.sessions).toEqual([]);
    expect(stale).toEqual({ sessions: [], state: duplicate.state });
  });

  it("clears interaction state on tab, URL, idle, and focus changes", () => {
    const initial = pulse(createInitialEngineState(), 1000).state;
    const tabChange = reduceFocusEvent(initial, {
      at: 2000,
      tabId: 2,
      type: "TAB_ACTIVATED",
      windowId: 10,
    });
    expect(tabChange.state.active).toBeNull();

    const urlChange = reduceFocusEvent(initial, {
      at: 2000,
      tabId: 1,
      type: "URL_CHANGED",
    });
    expect(urlChange.state.active).toBeNull();

    const idle = reduceFocusEvent(initial, {
      at: 2000,
      state: "idle",
      type: "IDLE_STATE_CHANGED",
    });
    expect(idle.state.active).toBeNull();

    const blur = reduceFocusEvent(initial, {
      at: 2000,
      focusedWindowId: null,
      type: "WINDOW_FOCUS_CHANGED",
    });
    expect(blur.state.active).toBeNull();
  });

  it("allows media through idle and blur but never through lock", () => {
    const media = pulse(createInitialEngineState(), 1000, "media").state;
    const idle = reduceFocusEvent(media, {
      at: 2000,
      state: "idle",
      type: "IDLE_STATE_CHANGED",
    });
    const blur = reduceFocusEvent(idle.state, {
      at: 3000,
      focusedWindowId: null,
      type: "WINDOW_FOCUS_CHANGED",
    });
    const locked = reduceFocusEvent(blur.state, {
      at: 4000,
      state: "locked",
      type: "IDLE_STATE_CHANGED",
    });

    expect(idle.state.active).not.toBeNull();
    expect(blur.state.active).not.toBeNull();
    expect(locked.state.active).toBeNull();
  });

  it("splits sessions across local midnight without losing time", () => {
    const start = new Date(2026, 6, 16, 23, 59, 58).getTime();
    const end = new Date(2026, 6, 17, 0, 0, 3).getTime();
    const parts = splitSessionByLocalDay({
      domain: "example.com",
      durationMs: end - start,
      endedAt: end,
      id: "session",
      mode: "interaction",
      startedAt: start,
    });

    expect(parts).toHaveLength(2);
    expect(parts.reduce((total, part) => total + part.durationMs, 0)).toBe(
      end - start,
    );
    expect(parts[0]?.endedAt).toBe(parts[1]?.startedAt);
  });

  it("maintains duration invariants for arbitrary pulse sequences", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 30_000 }), {
          minLength: 1,
          maxLength: 200,
        }),
        (gaps) => {
          let state = createInitialEngineState();
          let now = 1000;
          let previousEnd = 0;

          for (const gap of gaps) {
            now += gap;
            const transition = pulse(state, now);
            state = transition.state;
            for (const session of transition.sessions) {
              expect(session.durationMs).toBeGreaterThan(0);
              expect(session.durationMs).toBeLessThanOrEqual(10_000);
              expect(session.endedAt - session.startedAt).toBe(
                session.durationMs,
              );
              expect(session.startedAt).toBeGreaterThanOrEqual(previousEnd);
              previousEnd = session.endedAt;
            }
          }
        },
      ),
    );
  });
});
