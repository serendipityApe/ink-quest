import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function createSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase webhook environment variables are not configured.");
  }

  // Use service role key for webhook — bypasses RLS
  return createClient(supabaseUrl, serviceRoleKey);
}

function verifySignature(payload: string, signature: string): boolean {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("LEMONSQUEEZY_WEBHOOK_SECRET is not configured.");
  }

  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  if (hmac.length !== signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
}

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get("x-signature") ?? "";

  if (!verifySignature(payload, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(payload);
  const eventName: string = event.meta?.event_name ?? "";
  const userEmail: string = event.data?.attributes?.user_email ?? "";
  const subscriptionId: string = String(event.data?.id ?? "");

  const isActive = ["subscription_created", "subscription_resumed", "subscription_unpaused"].includes(eventName);
  const isInactive = ["subscription_cancelled", "subscription_expired", "subscription_paused"].includes(eventName);

  if (isActive || isInactive) {
    const supabaseAdmin = createSupabaseAdmin();

    await supabaseAdmin
      .from("profiles")
      .update({
        is_premium: isActive,
        ls_subscription_id: isActive ? subscriptionId : null,
      })
      .eq("email", userEmail);
  }

  return NextResponse.json({ received: true });
}
