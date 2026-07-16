import { ACTIVITY_MODES, type ActivityMode, type IdleState } from "./types";

export interface MediaState {
  ended: boolean;
  paused: boolean;
  playbackRate: number;
  readyState: number;
}

export function isMediaElementPlaying(media: MediaState): boolean {
  return (
    !media.paused &&
    !media.ended &&
    media.readyState >= 2 &&
    media.playbackRate > 0
  );
}

export function normalizePulseMode(value: unknown): ActivityMode {
  return ACTIVITY_MODES.includes(value as ActivityMode)
    ? (value as ActivityMode)
    : "interaction";
}

export function selectPulseMode(input: {
  mediaPlaying: boolean;
  recentlyActive: boolean;
}): ActivityMode {
  if (input.mediaPlaying) {
    return "media";
  }
  return input.recentlyActive ? "interaction" : "foreground";
}

export function resolvePulseMode(
  requested: unknown,
  audible: boolean,
): ActivityMode | null {
  const mode = normalizePulseMode(requested);
  if (mode === "foreground") {
    return audible ? "media" : null;
  }
  return mode;
}

export function canCountIdleState(
  mode: ActivityMode,
  state: IdleState,
): boolean {
  return state === "active" || (mode === "media" && state === "idle");
}

export function canCountWindowState(
  mode: ActivityMode,
  focused: boolean,
): boolean {
  return focused || mode === "media";
}
