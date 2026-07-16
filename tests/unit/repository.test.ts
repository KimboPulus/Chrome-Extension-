import { FocusRepository } from "../../src/storage/repository";
import { SCHEMA_VERSION } from "../../src/storage/schema";
import { MemoryStorage } from "../helpers/memory-storage";

function session(id: string, startedAt: number, endedAt: number) {
  return {
    domain: "example.com",
    durationMs: endedAt - startedAt,
    endedAt,
    id,
    mode: "interaction" as const,
    startedAt,
  };
}

describe("FocusRepository", () => {
  it("migrates legacy settings and daily stats to schema v2", async () => {
    const local = new MemoryStorage({
      "stats:2026-07-16": { "www.example.com": { activeMs: 5000 } },
      settings: { blockedSites: ["www.youtube.com"] },
    });
    const repository = new FocusRepository(local, new MemoryStorage());

    await repository.migrate();

    expect(local.data.schemaVersion).toBe(SCHEMA_VERSION);
    await expect(repository.getSettings()).resolves.toMatchObject({
      blockedSites: ["youtube.com"],
      retentionDays: 30,
    });
    await expect(repository.getUsage("2026-07-16")).resolves.toEqual({
      "example.com": {
        activeMs: 5000,
        interactionMs: 5000,
        lastActiveAt: 0,
        mediaMs: 0,
        sessionCount: 0,
      },
    });
  });

  it("records idempotent segments and counts continuous sessions once", async () => {
    const local = new MemoryStorage();
    const repository = new FocusRepository(local, new MemoryStorage());
    const first = session(
      "one",
      new Date(2026, 6, 16, 12).getTime(),
      new Date(2026, 6, 16, 12, 0, 5).getTime(),
    );
    const second = session("two", first.endedAt, first.endedAt + 5000);

    await expect(repository.recordSession(first)).resolves.toBe(5000);
    await expect(repository.recordSession(first)).resolves.toBe(0);
    await expect(repository.recordSession(second)).resolves.toBe(5000);

    await expect(repository.getUsage("2026-07-16")).resolves.toMatchObject({
      "example.com": {
        activeMs: 10_000,
        interactionMs: 10_000,
        sessionCount: 1,
      },
    });
    expect(local.data["sessions:2026-07-16"]).toEqual([
      expect.objectContaining({ durationMs: 10_000, id: "one:0" }),
    ]);
    expect(local.data["dedupe:2026-07-16"]).toEqual(["one:0", "two:0"]);
  });

  it("bounds detailed history without losing aggregate usage", async () => {
    const local = new MemoryStorage();
    const repository = new FocusRepository(local, new MemoryStorage());
    const start = new Date(2026, 6, 16, 12).getTime();

    for (let index = 0; index < 120; index += 1) {
      const startedAt = start + index * 6000;
      await repository.recordSession(
        session(`bounded-${index}`, startedAt, startedAt + 5000),
      );
    }

    expect(local.data["sessions:2026-07-16"]).toHaveLength(100);
    expect(local.data["dedupe:2026-07-16"]).toHaveLength(64);
    await expect(repository.getUsage("2026-07-16")).resolves.toMatchObject({
      "example.com": { activeMs: 600_000, sessionCount: 120 },
    });
  });

  it("resets daily runtime state only when date changes", async () => {
    const repository = new FocusRepository(
      new MemoryStorage(),
      new MemoryStorage(),
    );
    await repository.saveRuntimeState({
      activeFocusSession: null,
      lastActiveDate: "2000-01-01",
      temporaryBlocks: ["youtube.com"],
      warnedDomains: ["youtube.com"],
    });

    const first = await repository.ensureCurrentDay(new Date(2026, 6, 16, 12));
    const second = await repository.ensureCurrentDay(new Date(2026, 6, 16, 18));

    expect(first.changed).toBe(true);
    expect(first.state).toMatchObject({
      lastActiveDate: "2026-07-16",
      temporaryBlocks: [],
      warnedDomains: [],
    });
    expect(second.changed).toBe(false);
  });

  it("prunes data outside retention without touching settings", async () => {
    const local = new MemoryStorage({
      "sessions:2026-07-01": [],
      "sessions:2026-07-15": [],
      "stats:2026-07-01": {},
      "stats:2026-07-15": {},
      settings: { retentionDays: 2 },
    });
    const repository = new FocusRepository(local, new MemoryStorage());

    await expect(
      repository.pruneHistory(2, new Date(2026, 6, 16, 12)),
    ).resolves.toEqual(["sessions:2026-07-01", "stats:2026-07-01"]);
    expect(local.data.settings).toBeDefined();
    expect(local.data["stats:2026-07-15"]).toBeDefined();
  });

  it("exports, resets, and restores validated local data", async () => {
    const local = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    const repository = new FocusRepository(local, sessionStorage);
    const startedAt = new Date(2026, 6, 16, 12).getTime();
    await repository.saveSettings({
      categories: { "example.com": "productive" },
    });
    await repository.recordSession(
      session("exported", startedAt, startedAt + 5000),
    );

    const exported = await repository.exportData(
      new Date("2026-07-16T12:00:00Z"),
    );
    expect(exported.product).toBe("Focus Meter");
    expect(exported.usage["2026-07-16"]?.["example.com"]?.activeMs).toBe(5000);
    expect(await repository.bytesInUse()).toBeGreaterThan(0);

    await repository.resetUsage();
    await expect(repository.getUsage("2026-07-16")).resolves.toEqual({});
    await repository.importData(exported);
    await expect(repository.getUsage("2026-07-16")).resolves.toMatchObject({
      "example.com": { activeMs: 5000 },
    });
    await expect(repository.importData({ product: "Other" })).rejects.toThrow(
      "not a Focus Meter export",
    );
  });

  it("reads ranges and persists engine state", async () => {
    const repository = new FocusRepository(
      new MemoryStorage(),
      new MemoryStorage(),
    );
    const state = {
      active: null,
      idleState: "active" as const,
      lastEventAt: 5000,
      version: 1 as const,
    };
    await repository.saveEngineState(state);
    await expect(repository.getEngineState()).resolves.toEqual(state);
    await expect(
      repository.getUsageRange(2, new Date(2026, 6, 16, 12)),
    ).resolves.toEqual([
      { date: "2026-07-15", usage: {} },
      { date: "2026-07-16", usage: {} },
    ]);
  });
});
