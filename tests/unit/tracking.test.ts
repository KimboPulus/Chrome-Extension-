import {
  canCountIdleState,
  canCountWindowState,
  isMediaElementPlaying,
  normalizePulseMode,
  resolvePulseMode,
  selectPulseMode,
} from "../../src/domain/tracking";

describe("tracking decisions", () => {
  it("detects playing media", () => {
    expect(
      isMediaElementPlaying({
        ended: false,
        paused: false,
        playbackRate: 1,
        readyState: 4,
      }),
    ).toBe(true);
    expect(
      isMediaElementPlaying({
        ended: false,
        paused: true,
        playbackRate: 1,
        readyState: 4,
      }),
    ).toBe(false);
  });

  it("prioritizes media then interaction", () => {
    expect(selectPulseMode({ mediaPlaying: true, recentlyActive: true })).toBe(
      "media",
    );
    expect(selectPulseMode({ mediaPlaying: false, recentlyActive: true })).toBe(
      "interaction",
    );
    expect(
      selectPulseMode({ mediaPlaying: false, recentlyActive: false }),
    ).toBe("foreground");
  });

  it("uses audible state only as foreground media fallback", () => {
    expect(resolvePulseMode("foreground", true)).toBe("media");
    expect(resolvePulseMode("foreground", false)).toBeNull();
    expect(resolvePulseMode("interaction", false)).toBe("interaction");
    expect(normalizePulseMode("invalid")).toBe("interaction");
  });

  it("counts media while idle or unfocused, but never locked", () => {
    expect(canCountIdleState("media", "idle")).toBe(true);
    expect(canCountIdleState("interaction", "idle")).toBe(false);
    expect(canCountIdleState("media", "locked")).toBe(false);
    expect(canCountWindowState("media", false)).toBe(true);
    expect(canCountWindowState("interaction", false)).toBe(false);
  });
});
