import assert from "node:assert/strict";
import test from "node:test";
import { isLiveCheckEnabled, isLoopbackHostname } from "./indexnow-live-check.mjs";

test("live checks are disabled by default", () => {
  assert.equal(isLiveCheckEnabled({}), false);
});

test("CI blocks remote checks even when the opt-in flag is set", () => {
  assert.equal(isLiveCheckEnabled({ CI: "true", INDEXNOW_LIVE_CHECK: "1" }), false);
  assert.equal(isLiveCheckEnabled({ GITHUB_ACTIONS: "true", INDEXNOW_LIVE_CHECK: "1" }), false);
});

test("an explicit local opt-in enables remote checks outside CI", () => {
  assert.equal(isLiveCheckEnabled({ INDEXNOW_LIVE_CHECK: "1" }), true);
});

test("IPv4 and serialized IPv6 loopback hosts are rejected", () => {
  for (const host of ["localhost", "127.0.0.1", "::1", "[::1]"]) {
    assert.equal(isLoopbackHostname(host), true, host);
  }
  assert.equal(isLoopbackHostname("project.supabase.co"), false);
});
