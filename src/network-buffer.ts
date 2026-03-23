import type { NetworkEntry } from "./types.js";

export interface NetworkFilter {
  filterUrl?: string;
  filterStatus?: string;
}

export class NetworkBuffer {
  private entries: NetworkEntry[] = [];
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  add(entry: NetworkEntry): void {
    if (this.entries.length >= this.maxSize) {
      this.entries.shift();
    }
    this.entries.push(entry);
  }

  update(requestId: string, updates: Partial<NetworkEntry>): void {
    const entry = this.entries.find((e) => e.request_id === requestId);
    if (entry) {
      Object.assign(entry, updates);
    }
  }

  getAll(): NetworkEntry[] {
    return [...this.entries];
  }

  getFiltered(filter: NetworkFilter): NetworkEntry[] {
    let result = this.entries;

    if (filter.filterUrl) {
      const re = new RegExp(filter.filterUrl);
      result = result.filter((e) => re.test(e.url));
    }

    if (filter.filterStatus) {
      const pattern = filter.filterStatus;
      if (pattern.includes("x")) {
        const prefix = pattern.replace(/x/g, "");
        result = result.filter(
          (e) => e.status !== null && String(e.status).startsWith(prefix)
        );
      } else {
        const code = parseInt(pattern, 10);
        result = result.filter((e) => e.status === code);
      }
    }

    return [...result];
  }

  clear(): void {
    this.entries = [];
  }

  get size(): number {
    return this.entries.length;
  }
}
