import { describe, it, expect, beforeEach } from "vitest";
import { RequestDeduplicator, createDedupedAsync } from "./deduplication";

describe("RequestDeduplicator", () => {
  let dedup: RequestDeduplicator;

  beforeEach(() => {
    dedup = new RequestDeduplicator({ windowMs: 1000 }); // 1 second window for tests
  });

  it("marks first request as unique", () => {
    const result = dedup.isUnique({
      deviceId: "DEV-1",
      checkpointId: "CP-1",
      sessionId: "SESSION-1",
    });
    expect(result).toBe(true);
  });

  it("marks duplicate within window as not unique", () => {
    const data = {
      deviceId: "DEV-1",
      checkpointId: "CP-1",
      sessionId: "SESSION-1",
    };

    dedup.isUnique(data);
    const result = dedup.isUnique(data);
    expect(result).toBe(false);
  });

  it("allows same request after window expires", async () => {
    const data = {
      deviceId: "DEV-1",
      checkpointId: "CP-1",
      sessionId: "SESSION-1",
    };

    dedup = new RequestDeduplicator({ windowMs: 100 });

    dedup.isUnique(data);
    expect(dedup.isUnique(data)).toBe(false);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(dedup.isUnique(data)).toBe(true);
  });

  it("tracks different requests independently", () => {
    const data1 = {
      deviceId: "DEV-1",
      checkpointId: "CP-1",
      sessionId: "SESSION-1",
    };
    const data2 = {
      deviceId: "DEV-1",
      checkpointId: "CP-1",
      sessionId: "SESSION-2",
    };

    expect(dedup.isUnique(data1)).toBe(true);
    expect(dedup.isUnique(data2)).toBe(true);
    expect(dedup.isUnique(data1)).toBe(false);
    expect(dedup.isUnique(data2)).toBe(false);
  });

  it("marks success and failure", () => {
    const data = {
      deviceId: "DEV-1",
      checkpointId: "CP-1",
    };

    dedup.isUnique(data);
    dedup.markSuccess(data, { ok: true });
    // Verify size didn't change
    expect(dedup.size()).toBe(1);

    dedup.markFailure(data, new Error("Test error"));
    expect(dedup.size()).toBe(1);
  });

  it("clears all requests", () => {
    dedup.isUnique({
      deviceId: "DEV-1",
      checkpointId: "CP-1",
    });
    dedup.isUnique({
      deviceId: "DEV-2",
      checkpointId: "CP-2",
    });

    expect(dedup.size()).toBe(2);
    dedup.clear();
    expect(dedup.size()).toBe(0);
  });

  it("enforces max request tracking limit", () => {
    const smallDedup = new RequestDeduplicator({ maxRequests: 3 });

    for (let i = 0; i < 5; i++) {
      smallDedup.isUnique({
        deviceId: `DEV-${i}`,
        checkpointId: "CP-1",
      });
    }

    expect(smallDedup.size()).toBeLessThanOrEqual(3);
  });
});

describe("createDedupedAsync", () => {
  it("deduplicates concurrent calls", async () => {
    let callCount = 0;

    const fn = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "result";
    };

    const deduped = createDedupedAsync(fn, () => "key-1");

    // Call 3 times concurrently
    const [r1, r2, r3] = await Promise.all([deduped(), deduped(), deduped()]);

    expect(r1).toBe("result");
    expect(r2).toBe("result");
    expect(r3).toBe("result");
    // Should only be called once despite 3 concurrent calls
    expect(callCount).toBe(1);
  });

  it("allows different keys to execute separately", async () => {
    let callCount = 0;

    const fn = async (key: string) => {
      callCount++;
      return key;
    };

    const deduped = createDedupedAsync(
      (key: string) => fn(key),
      (key: string) => key,
    );

    const [r1, r2] = await Promise.all([deduped("key-1"), deduped("key-2")]);

    expect(r1).toBe("key-1");
    expect(r2).toBe("key-2");
    // Different keys = separate calls
    expect(callCount).toBe(2);
  });

  it("cleans up after promise settles", async () => {
    const fn = async () => "result";
    const deduped = createDedupedAsync(fn, () => "key");

    await deduped();
    const r2 = await deduped();

    // Second call after first is done should trigger new call
    expect(r2).toBe("result");
  });
});
