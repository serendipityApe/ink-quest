interface QueryResult<T> {
  data: T | null;
  error: { code: string } | null;
  status: number;
}

export interface BillingSnapshot {
  profile: QueryResult<{ is_premium: boolean | null }>;
  subscriptions: QueryResult<Array<{ status: string; ends_at: string | null }>>;
  account: QueryResult<{ available: number; reserved: number }>;
}

export interface BillingDiagnostic {
  event: "query_failed" | "refresh_failed" | "identity_changed" | "unexpected_failure";
  query?: keyof BillingSnapshot;
  code?: string;
  status?: number;
  attempt?: number;
}

interface Dependencies {
  getUser: () => Promise<{ id: string } | null>;
  refreshSession: () => Promise<boolean>;
  read: (userId: string) => Promise<BillingSnapshot>;
  report: (diagnostic: BillingDiagnostic) => void;
}

type BillingResult =
  | { status: 200; body: { premium: boolean; credits: { available: number; reserved: number } } }
  | { status: 401 | 503; body: { error: string } };

function subscriptionHasAccess(status: string, endsAt: string | null) {
  if (["active", "on_trial"].includes(status)) return true;
  return status === "cancelled" && Boolean(endsAt) && new Date(endsAt as string).getTime() > Date.now();
}

export async function getBillingStatus(deps: Dependencies): Promise<BillingResult> {
  try {
    const user = await deps.getUser();
    if (!user) return { status: 401, body: { error: "unauthorized" } };

    for (let attempt = 0; attempt < 2; attempt++) {
      const snapshot = await deps.read(user.id);
      const failures = (Object.keys(snapshot) as Array<keyof BillingSnapshot>)
        .filter((query) => snapshot[query].error);

      if (failures.length === 0) {
        return {
          status: 200,
          body: {
            premium: Boolean(snapshot.profile.data?.is_premium) ||
              (snapshot.subscriptions.data ?? []).some((subscription) =>
                subscriptionHasAccess(subscription.status, subscription.ends_at)
              ),
            credits: snapshot.account.data ?? { available: 0, reserved: 0 },
          },
        };
      }

      // Log only fixed query names, error codes and HTTP status. Error messages,
      // details and auth/session objects can contain private data.
      for (const query of failures) {
        deps.report({
          event: "query_failed", query, code: snapshot[query].error?.code,
          status: snapshot[query].status, attempt,
        });
      }

      const jwtFailed = failures.some((query) =>
        ["PGRST301", "PGRST302", "PGRST303"].includes(snapshot[query].error?.code ?? "")
      );
      if (!jwtFailed) return { status: 503, body: { error: "billing_status_unavailable" } };
      if (attempt === 1) return { status: 401, body: { error: "session_refresh_required" } };

      // This endpoint only reads billing data. Recover a rejected JWT once,
      // keeping every query under the user's RLS-protected client.
      if (!await deps.refreshSession()) {
        deps.report({ event: "refresh_failed" });
        return { status: 401, body: { error: "session_refresh_required" } };
      }
      const refreshedUser = await deps.getUser();
      if (!refreshedUser || refreshedUser.id !== user.id) {
        deps.report({ event: "identity_changed" });
        return { status: 401, body: { error: "session_refresh_required" } };
      }
    }
  } catch {
    deps.report({ event: "unexpected_failure" });
  }
  return { status: 503, body: { error: "billing_status_unavailable" } };
}
