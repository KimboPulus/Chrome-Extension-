import { reduceFocusEvent } from "../domain/focus-engine";
import type { FocusEvent } from "../domain/types";
import type { FocusRepository } from "../storage/repository";

export interface FocusEventResult {
  recordedMs: number;
  sessionCount: number;
}

export class FocusService {
  constructor(private readonly repository: FocusRepository) {}

  async initialize(now = new Date()): Promise<void> {
    await this.repository.migrate();
    const settings = await this.repository.getSettings();
    await this.repository.ensureCurrentDay(now);
    await this.repository.pruneHistory(settings.retentionDays, now);
  }

  async process(event: FocusEvent): Promise<FocusEventResult> {
    const current = await this.repository.getEngineState();
    const transition = reduceFocusEvent(current, event);
    let recordedMs = 0;

    for (const session of transition.sessions) {
      recordedMs += await this.repository.recordSession(session);
    }

    await this.repository.saveEngineState(transition.state);
    return { recordedMs, sessionCount: transition.sessions.length };
  }

  async reset(at = Date.now()): Promise<void> {
    await this.process({ at, type: "RESET" });
  }
}
