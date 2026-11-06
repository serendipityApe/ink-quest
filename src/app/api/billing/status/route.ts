import { createClient } from "@/lib/supabase/server";
import { getBillingStatus, type BillingDiagnostic } from "@/lib/billing/status";

export async function GET() {
  const report = (diagnostic: BillingDiagnostic) => console.warn("Billing status", diagnostic);
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const supabase = await createClient();
    const result = await getBillingStatus({
      getUser: async () => {
        const { data: { user }, error } = await supabase.auth.getUser();
        return error || !user ? null : { id: user.id };
      },
      refreshSession: async () => {
        const { error } = await supabase.auth.refreshSession();
        return !error;
      },
      read: async (userId) => {
        const [profile, subscriptions, account] = await Promise.all([
          supabase.from("profiles").select("is_premium").eq("id", userId).maybeSingle(),
          supabase.from("billing_subscriptions").select("status,ends_at").eq("user_id", userId),
          supabase.from("credit_accounts").select("available,reserved").eq("user_id", userId).maybeSingle(),
        ]);
        return { profile, subscriptions, account };
      },
      report,
    });
    return Response.json(result.body, { status: result.status, headers });
  } catch {
    report({ event: "unexpected_failure" });
    return Response.json({ error: "billing_status_unavailable" }, { status: 503, headers });
  }
}
