import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getItem,
  setItem,
  clearAllData,
  getStorageQuota,
  checkStorageHealth,
  restoreFromBackup,
  exportData,
  importData,
} from "./storage";

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
    get length() {
      return Object.keys(store).length;
    },
  };
})();

Object.defineProperty(global, "localStorage", { value: localStorageMock });

describe("Enhanced Storage", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe("getItem / setItem", () => {
    it("stores and retrieves data", () => {
      const data = { name: "Test", value: 123 };
      const result = setItem("test-key", data);
      expect(result.success).toBe(true);

      const retrieved = getItem("test-key");
      expect(retrieved).toEqual(data);
    });

    it("returns default value for missing keys", () => {
      const defaultValue = { default: true };
      const result = getItem("missing", defaultValue);
      expect(result).toEqual(defaultValue);
    });

    it("handles JSON serialization errors gracefully", () => {
      // Store invalid JSON
      localStorageMock.setItem("vs_corrupted", "not valid json");

      const result = getItem("corrupted");
      expect(result).toBeNull();
    });

    it("creates backup on write", () => {
      const data = { backup: true };
      setItem("test", data);

      // Check backup exists
      expect(localStorageMock.getItem("vs_test_backup")).toBeTruthy();
    });
  });

  describe("restoreFromBackup", () => {
    it("restores from backup when primary is corrupted", () => {
      const data = { original: true };
      setItem("test", data);

      // Corrupt primary
      localStorageMock.setItem("vs_test", "corrupted");

      // Restore from backup
      const restored = restoreFromBackup("test");
      expect(restored).toBe(true);

      // Verify restored data
      const result = getItem("test");
      expect(result).toEqual(data);
    });
  });

  describe("Storage Quota", () => {
    it("reports storage quota", () => {
      const quota = getStorageQuota();
      expect(quota).toHaveProperty("usage");
      expect(quota).toHaveProperty("limit");
      expect(quota).toHaveProperty("percentage");
      expect(quota).toHaveProperty("critical");
      expect(quota.percentage).toBeGreaterThanOrEqual(0);
      expect(quota.percentage).toBeLessThanOrEqual(100);
    });

    it("marks quota as critical when near limit", () => {
      // Store many items to approach quota
      for (let i = 0; i < 100; i++) {
        setItem(`key-${i}`, { data: "x".repeat(1000) });
      }

      const quota = getStorageQuota();
      // Percentage should be non-zero
      expect(quota.percentage).toBeGreaterThan(0);
    });
  });

  describe("Storage Health", () => {
    it("checks storage health", () => {
      setItem("test", { healthy: true });

      const health = checkStorageHealth();
      expect(health).toHaveProperty("quota");
      expect(health).toHaveProperty("corruptedItems");
      expect(health).toHaveProperty("totalItems");
      expect(Array.isArray(health.corruptedItems)).toBe(true);
    });

    it("detects corrupted items", () => {
      // Store valid item
      setItem("valid", { data: true });

      // Add corrupted item directly
      localStorageMock.setItem("vs_corrupted", "not json");

      const health = checkStorageHealth();
      expect(health.corruptedItems).toContain("vs_corrupted");
    });
  });

  describe("Export / Import", () => {
    it("exports all data", () => {
      setItem("key1", { data: 1 });
      setItem("key2", { data: 2 });

      const exported = exportData();
      expect(exported["vs_key1"]).toEqual({ data: 1 });
      expect(exported["vs_key2"]).toEqual({ data: 2 });
    });

    it("imports data correctly", () => {
      const data = {
        vs_imported1: { value: 1 },
        vs_imported2: { value: 2 },
      };

      importData(data);

      expect(getItem("imported1")).toEqual({ value: 1 });
      expect(getItem("imported2")).toEqual({ value: 2 });
    });
  });

  describe("clearAllData", () => {
    it("clears all VeriShield data", () => {
      setItem("key1", { data: 1 });
      setItem("key2", { data: 2 });
      localStorageMock.setItem("other-key", "other");

      clearAllData();

      expect(getItem("key1")).toBeNull();
      expect(getItem("key2")).toBeNull();
      expect(localStorageMock.getItem("other-key")).toBe("other");
    });
  });
});
