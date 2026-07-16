import type {
  ActiveTarget,
  FocusEngineState,
  FocusEvent,
  FocusSession,
} from "./types";

export const MAX_PULSE_GAP_MS = 10_000;

export function createInitialEngineState(): FocusEngineState {
  return {
    active: null,
    idleState: "active",
    lastEventAt: 0,
    version: 1,
  };
}

export interface EngineTransition {
  sessions: FocusSession[];
  state: FocusEngineState;
}

function sessionId(active: ActiveTarget, endedAt: number): string {
  return `${active.tabId}:${active.lastPulseAt}:${endedAt}:${active.domain}`;
}

function clearActive(state: FocusEngineState, at: number): FocusEngineState {
  return {
    ...state,
    active: null,
    lastEventAt: Math.max(state.lastEventAt, at),
  };
}

export function reduceFocusEvent(
  state: FocusEngineState,
  event: FocusEvent,
  maxPulseGapMs = MAX_PULSE_GAP_MS,
): EngineTransition {
  if (!Number.isFinite(event.at) || event.at < state.lastEventAt) {
    return { sessions: [], state };
  }

  if (event.type === "RESET") {
    return {
      sessions: [],
      state: { ...createInitialEngineState(), lastEventAt: event.at },
    };
  }

  if (event.type === "ACTIVITY_PULSE") {
    const previous = state.active;
    const nextActive: ActiveTarget = {
      domain: event.domain,
      lastPulseAt: event.at,
      mode: event.mode,
      startedAt:
        previous?.tabId === event.tabId && previous.domain === event.domain
          ? previous.startedAt
          : event.at,
      tabId: event.tabId,
      windowId: event.windowId,
    };

    const nextState: FocusEngineState = {
      ...state,
      active: nextActive,
      lastEventAt: event.at,
    };

    if (
      !previous ||
      previous.tabId !== event.tabId ||
      previous.windowId !== event.windowId ||
      previous.domain !== event.domain ||
      event.at <= previous.lastPulseAt
    ) {
      return { sessions: [], state: nextState };
    }

    const durationMs = Math.min(maxPulseGapMs, event.at - previous.lastPulseAt);
    const endedAt = event.at;
    const startedAt = endedAt - durationMs;

    return {
      sessions: [
        {
          domain: previous.domain,
          durationMs,
          endedAt,
          id: sessionId(previous, endedAt),
          mode: previous.mode,
          startedAt,
        },
      ],
      state: nextState,
    };
  }

  if (event.type === "IDLE_STATE_CHANGED") {
    const shouldClear =
      event.state === "locked" ||
      (event.state === "idle" && state.active?.mode !== "media");
    return {
      sessions: [],
      state: {
        ...(shouldClear ? clearActive(state, event.at) : state),
        idleState: event.state,
        lastEventAt: event.at,
      },
    };
  }

  if (event.type === "TAB_ACTIVATED") {
    const shouldClear =
      state.active !== null &&
      (state.active.tabId !== event.tabId ||
        state.active.windowId !== event.windowId);
    return {
      sessions: [],
      state: shouldClear
        ? clearActive(state, event.at)
        : { ...state, lastEventAt: event.at },
    };
  }

  if (event.type === "WINDOW_FOCUS_CHANGED") {
    const shouldClear =
      state.active?.mode !== "media" &&
      state.active !== null &&
      state.active.windowId !== event.focusedWindowId;
    return {
      sessions: [],
      state: shouldClear
        ? clearActive(state, event.at)
        : { ...state, lastEventAt: event.at },
    };
  }

  if (event.type === "TAB_REMOVED" || event.type === "URL_CHANGED") {
    return {
      sessions: [],
      state:
        state.active?.tabId === event.tabId
          ? clearActive(state, event.at)
          : { ...state, lastEventAt: event.at },
    };
  }

  const isStale =
    state.active !== null &&
    event.at - state.active.lastPulseAt > maxPulseGapMs;
  return {
    sessions: [],
    state: isStale
      ? clearActive(state, event.at)
      : { ...state, lastEventAt: event.at },
  };
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function splitSessionByLocalDay(session: FocusSession): FocusSession[] {
  if (session.durationMs <= 0 || session.endedAt <= session.startedAt) {
    return [];
  }

  const parts: FocusSession[] = [];
  let cursor = session.startedAt;
  let part = 0;

  while (cursor < session.endedAt) {
    const nextMidnight = new Date(cursor);
    nextMidnight.setHours(24, 0, 0, 0);
    const partEnd = Math.min(session.endedAt, nextMidnight.getTime());
    parts.push({
      ...session,
      durationMs: partEnd - cursor,
      endedAt: partEnd,
      id: `${session.id}:${part}`,
      startedAt: cursor,
    });
    cursor = partEnd;
    part += 1;
  }

  return parts;
}
