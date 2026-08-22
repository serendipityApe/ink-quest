import { createClient } from "@/lib/supabase/server";

function subscriptionHasAccess(status: string, endsAt: string | null) {
  if (["active", "on_trial"].includes(status)) return true;
  return status === "cancelled" && Boolean(endsAt) && new Date(endsAt as string).getTime() > Date.now();
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const [profileResult, subscriptionResult, accountResult] = await Promise.all([
    supabase.from("profiles").select("is_premium").eq("id", user.id).maybeSingle(),
    supabase.from("billing_subscriptions").select("status,ends_at").eq("user_id", user.id),
    supabase.from("credit_accounts").select("available,reserved").eq("user_id", user.id).maybeSingle(),
  ]);

  if (profileResult.error || subscriptionResult.error || accountResult.error) {
    return Response.json({ error: "billing_status_unavailable" }, { status: 503 });
  }

  const premium = Boolean(profileResult.data?.is_premium) ||
    (subscriptionResult.data ?? []).some((subscription) =>
      subscriptionHasAccess(subscription.status, subscription.ends_at)
    );

  return Response.json({
    premium,
    credits: accountResult.data ?? { available: 0, reserved: 0 },
  });
}
