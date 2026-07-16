import { FocusService } from "../../src/application/focus-service";
import { FocusRepository } from "../../src/storage/repository";
import { MemoryStorage } from "../helpers/memory-storage";

describe("FocusService integration", () => {
  it("restores persisted engine checkpoints after a service-worker restart", async () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    const repository = new FocusRepository(local, session);
    const firstWorker = new FocusService(repository);
    await firstWorker.initialize(new Date(2026, 6, 16, 12));

    await firstWorker.process({
      at: new Date(2026, 6, 16, 12).getTime(),
      domain: "example.com",
      mode: "interaction",
      tabId: 1,
      type: "ACTIVITY_PULSE",
      windowId: 1,
    });

    const restartedWorker = new FocusService(
      new FocusRepository(local, session),
    );
    const result = await restartedWorker.process({
      at: new Date(2026, 6, 16, 12, 0, 5).getTime(),
      domain: "example.com",
      mode: "interaction",
      tabId: 1,
      type: "ACTIVITY_PULSE",
      windowId: 1,
    });

    expect(result).toEqual({ recordedMs: 5000, sessionCount: 1 });
    await expect(repository.getUsage("2026-07-16")).resolves.toMatchObject({
      "example.com": { activeMs: 5000 },
    });
  });

  it("stops a sequence at idle and does not bridge the gap", async () => {
    const repository = new FocusRepository(
      new MemoryStorage(),
      new MemoryStorage(),
    );
    const service = new FocusService(repository);
    const start = new Date(2026, 6, 16, 12).getTime();
    await service.initialize(new Date(start));
    await service.process({
      at: start,
      domain: "example.com",
      mode: "interaction",
      tabId: 1,
      type: "ACTIVITY_PULSE",
      windowId: 1,
    });
    await service.process({
      at: start + 2000,
      state: "idle",
      type: "IDLE_STATE_CHANGED",
    });
    const resumed = await service.process({
      at: start + 60_000,
      domain: "example.com",
      mode: "interaction",
      tabId: 1,
      type: "ACTIVITY_PULSE",
      windowId: 1,
    });

    expect(resumed.recordedMs).toBe(0);
    await service.reset(start + 61_000);
    await expect(repository.getEngineState()).resolves.toMatchObject({
      active: null,
    });
  });
});
