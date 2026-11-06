import assert from "node:assert/strict";
import test from "node:test";
import { getBillingStatus } from "../src/lib/billing/status.ts";

function snapshot(profileError = null) {
  return {
    profile: { data: profileError ? null : { is_premium: false }, error: profileError, status: profileError ? 401 : 200 },
    subscriptions: { data: [{ status: "active", ends_at: null }], error: null, status: 200 },
    account: { data: { available: 80, reserved: 20 }, error: null, status: 200 },
  };
}

function fixture(snapshots, overrides = {}) {
  const calls = { reads: [], refreshes: 0, users: 0 };
  const diagnostics = [];
  const deps = {
    getUser: async () => { calls.users++; return { id: "fixture-user" }; },
    refreshSession: async () => { calls.refreshes++; return true; },
    read: async (userId) => {
      calls.reads.push(userId);
      return snapshots[Math.min(calls.reads.length - 1, snapshots.length - 1)];
    },
    report: (diagnostic) => diagnostics.push(diagnostic),
    ...overrides,
  };
  return { deps, calls, diagnostics };
}

test("valid user reads premium and credits without refreshing the session", async () => {
  const f = fixture([snapshot()]);
  assert.deepEqual(await getBillingStatus(f.deps), {
    status: 200, body: { premium: true, credits: { available: 80, reserved: 20 } },
  });
  assert.equal(f.calls.refreshes, 0);
  assert.deepEqual(f.calls.reads, ["fixture-user"]);
});

test("a PGRST303 profile failure refreshes once, revalidates identity and recovers", async () => {
  const f = fixture([snapshot({ code: "PGRST303", message: "fixture-private-message", details: "fixture-token" }), snapshot()]);
  assert.equal((await getBillingStatus(f.deps)).status, 200);
  assert.equal(f.calls.refreshes, 1);
  assert.equal(f.calls.users, 2);
  assert.deepEqual(f.calls.reads, ["fixture-user", "fixture-user"]);
  assert.deepEqual(f.diagnostics, [{ event: "query_failed", query: "profile", code: "PGRST303", status: 401, attempt: 0 }]);
  assert.doesNotMatch(JSON.stringify(f.diagnostics), /fixture-private-message|fixture-token/);
});

test("a persistent JWT rejection stops after one refresh and asks for sign-in", async () => {
  const f = fixture([snapshot({ code: "PGRST303" })]);
  assert.deepEqual(await getBillingStatus(f.deps), { status: 401, body: { error: "session_refresh_required" } });
  assert.equal(f.calls.refreshes, 1);
  assert.equal(f.calls.reads.length, 2);
});

test("a permission error stays unavailable and never refreshes or bypasses RLS", async () => {
  const failed = snapshot({ code: "42501" });
  failed.profile.status = 403;
  const f = fixture([failed]);
  assert.deepEqual(await getBillingStatus(f.deps), { status: 503, body: { error: "billing_status_unavailable" } });
  assert.equal(f.calls.refreshes, 0);
  assert.equal(f.calls.reads.length, 1);
  assert.deepEqual(f.diagnostics, [{ event: "query_failed", query: "profile", code: "42501", status: 403, attempt: 0 }]);
});

test("refresh failure stops before issuing more billing queries", async () => {
  const f = fixture([snapshot({ code: "PGRST303" })], { refreshSession: async () => false });
  assert.equal((await getBillingStatus(f.deps)).status, 401);
  assert.equal(f.calls.reads.length, 1);
  assert.equal(f.diagnostics.at(-1).event, "refresh_failed");
});

test("an identity change during refresh cannot return another user's balance", async () => {
  let userChecks = 0;
  const f = fixture([snapshot({ code: "PGRST303" }), snapshot()], {
    getUser: async () => ({ id: ++userChecks === 1 ? "fixture-user" : "fixture-other-user" }),
  });
  assert.equal((await getBillingStatus(f.deps)).status, 401);
  assert.deepEqual(f.calls.reads, ["fixture-user"]);
  assert.equal(f.diagnostics.at(-1).event, "identity_changed");
});

test("no user performs no billing query or refresh", async () => {
  const f = fixture([], { getUser: async () => null });
  assert.deepEqual(await getBillingStatus(f.deps), { status: 401, body: { error: "unauthorized" } });
  assert.equal(f.calls.reads.length, 0);
  assert.equal(f.calls.refreshes, 0);
});

test("missing optional account and profile rows are successful zero balance", async () => {
  const empty = snapshot();
  empty.profile.data = null;
  empty.account.data = null;
  empty.subscriptions.data = [];
  const f = fixture([empty]);
  assert.deepEqual(await getBillingStatus(f.deps), { status: 200, body: { premium: false, credits: { available: 0, reserved: 0 } } });
});

test("unexpected transport exceptions are sanitized", async () => {
  const f = fixture([], { read: async () => { throw new Error("fixture-private-auth-header"); } });
  assert.deepEqual(await getBillingStatus(f.deps), { status: 503, body: { error: "billing_status_unavailable" } });
  assert.deepEqual(f.diagnostics, [{ event: "unexpected_failure" }]);
});
