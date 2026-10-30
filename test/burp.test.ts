import { test } from "node:test";
import { strict as assert } from "node:assert";

// Manual fetch mock (no sinon — the repo takes no new test deps)
type Res = { ok: boolean; status: number; json?: () => Promise<any>; text?: () => Promise<string> };
let _next: Res | null = null;
function mockFetch(res: Res) { _next = res; }
global.fetch = (async (_url: any, _init?: any) => {
  if (!_next) throw new Error("no mock response set");
  const r = _next; _next = null; return r as any;
}) as any;

import {
  burpAvailable,
  burpScanStart,
  burpScanStatus,
  burpScanIssues,
  burpScannerStatus,
  burpIssueDefinitions,
  burpProxyHistory,
  burpConfigurationGet,
} from "../src/burp.js";

test("burpAvailable - returns true when Burp is reachable", async () => {
  // Mock a successful response
  mockFetch({
    ok: true,
    status: 200,
    text: async () => "{}"
  });

  const result = await burpAvailable();
  assert.strictEqual(result, true);
});

test("burpAvailable - returns false when Burp is not reachable", async () => {
  // Mock a failed response
  mockFetch({
    ok: false,
    status: 500,
    text: async () => "Internal Server Error"
  });

  const result = await burpAvailable();
  assert.strictEqual(result, false);
});

test("burpScanStart - returns scan ID on success", async () => {
  mockFetch({
    ok: true,
    status: 200,
    json: async () => ({ scan_id: "scan-123" })
  });

  const result = await burpScanStart(["http://example.com"]);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.scan_id, "scan-123");
});

test("burpScanStart - returns error on failure", async () => {
  mockFetch({
    ok: false,
    status: 400,
    text: async () => "Bad Request"
  });

  const result = await burpScanStart(["http://example.com"]);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error?.includes("400"));
});

test("burpScanStatus - returns scan status on success", async () => {
  mockFetch({
    ok: true,
    status: 200,
    json: async () => ({ state: "running", percentage: 50 })
  });

  const result = await burpScanStatus("scan-123");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status?.state, "running");
  assert.strictEqual(result.status?.percentage, 50);
});

test("burpScanIssues - returns normalized issues", async () => {
  mockFetch({
    ok: true,
    status: 200,
    json: async () => ({
      issues: [
        {
          id: "issue-1",
          name: "Test Issue",
          severity: "High",
          confidence: "Certain",
          url: "http://example.com/test",
          issue_detail: "This is a test issue detail that's very long and should be truncated to 2000 characters at most. ".repeat(300),
          remediation: "Fix the issue by doing something.",
          references: ["ref1", "ref2"]
        }
      ]
    })
  });

  const result = await burpScanIssues("scan-123");
  assert.strictEqual(result.ok, true);
  assert.ok(result.issues?.length);
  assert.strictEqual(result.issues?.[0].name, "Test Issue");
  // Check that issue_detail is truncated to 2000 chars
  assert.ok(result.issues?.[0].issue_detail.length <= 2000);
});

test("burpProxyHistory - returns normalized history items", async () => {
  mockFetch({
    ok: true,
    status: 200,
    json: async () => ({
      items: [
        {
          id: "item-1",
          url: "http://example.com/test",
          method: "GET",
          status: 200,
          host: "example.com",
          response_bytes: 1024
        }
      ]
    })
  });

  const result = await burpProxyHistory();
  assert.strictEqual(result.ok, true);
  assert.ok(result.items?.length);
  assert.strictEqual(result.items?.[0].url, "http://example.com/test");
});

test("burpConfigurationGet - returns configuration", async () => {
  mockFetch({
    ok: true,
    status: 200,
    json: async () => ({
      configuration: {
        proxy: {
          port: 8080,
          host: "127.0.0.1"
        },
        scanner: {
          max_scans: 5
        }
      }
    })
  });

  const result = await burpConfigurationGet();
  assert.strictEqual(result.ok, true);
  assert.ok(result.config);
  assert.strictEqual(result.config?.proxy?.port, 8080);
});