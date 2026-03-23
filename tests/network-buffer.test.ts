import { describe, it, expect } from "vitest";
import { NetworkBuffer } from "../src/network-buffer.js";
import type { NetworkEntry } from "../src/types.js";

function makeEntry(overrides: Partial<NetworkEntry> = {}): NetworkEntry {
  return {
    request_id: "req-1",
    method: "GET",
    url: "https://example.com",
    status: 200,
    mime_type: "text/html",
    response_headers: {},
    request_headers: {},
    redirected_from: null,
    redirected_to: null,
    timing: { start: 0, end: 100 },
    error: null,
    ...overrides,
  };
}

describe("NetworkBuffer", () => {
  it("stores and retrieves entries", () => {
    const buf = new NetworkBuffer(10);
    buf.add(makeEntry({ request_id: "r1" }));
    buf.add(makeEntry({ request_id: "r2" }));
    const entries = buf.getAll();
    expect(entries).toHaveLength(2);
    expect(entries[0].request_id).toBe("r1");
  });

  it("evicts oldest entries when full", () => {
    const buf = new NetworkBuffer(3);
    buf.add(makeEntry({ request_id: "r1" }));
    buf.add(makeEntry({ request_id: "r2" }));
    buf.add(makeEntry({ request_id: "r3" }));
    buf.add(makeEntry({ request_id: "r4" }));
    const entries = buf.getAll();
    expect(entries).toHaveLength(3);
    expect(entries[0].request_id).toBe("r2");
  });

  it("clears entries", () => {
    const buf = new NetworkBuffer(10);
    buf.add(makeEntry());
    buf.clear();
    expect(buf.getAll()).toHaveLength(0);
  });

  it("filters by URL regex", () => {
    const buf = new NetworkBuffer(10);
    buf.add(makeEntry({ url: "https://api.example.com/users" }));
    buf.add(makeEntry({ url: "https://cdn.example.com/image.png" }));
    const filtered = buf.getFiltered({ filterUrl: "api\\.example" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].url).toContain("api.example");
  });

  it("filters by status code pattern", () => {
    const buf = new NetworkBuffer(10);
    buf.add(makeEntry({ status: 200 }));
    buf.add(makeEntry({ status: 404 }));
    buf.add(makeEntry({ status: 401 }));
    expect(buf.getFiltered({ filterStatus: "4xx" })).toHaveLength(2);
    expect(buf.getFiltered({ filterStatus: "404" })).toHaveLength(1);
  });

  it("updates existing entry by request_id", () => {
    const buf = new NetworkBuffer(10);
    buf.add(makeEntry({ request_id: "r1", status: null }));
    buf.update("r1", { status: 200, mime_type: "text/html" });
    const entries = buf.getAll();
    expect(entries[0].status).toBe(200);
  });
});
