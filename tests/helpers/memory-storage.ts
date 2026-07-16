import type { StorageAreaLike } from "../../src/storage/repository";

export class MemoryStorage implements StorageAreaLike {
  readonly data: Record<string, unknown>;

  constructor(initial: Record<string, unknown> = {}) {
    this.data = structuredClone(initial);
  }

  get(keys: null | string | string[] = null): Promise<Record<string, unknown>> {
    if (keys === null) {
      return Promise.resolve(structuredClone(this.data));
    }

    const selected: Record<string, unknown> = {};
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      selected[key] = structuredClone(this.data[key]);
    }
    return Promise.resolve(selected);
  }

  set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.data, structuredClone(items));
    return Promise.resolve();
  }

  remove(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete this.data[key];
    }
    return Promise.resolve();
  }

  getBytesInUse(): Promise<number> {
    return Promise.resolve(Buffer.byteLength(JSON.stringify(this.data)));
  }
}
