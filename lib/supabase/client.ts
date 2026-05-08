import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

let browserClient: ReturnType<typeof createClient<Database>> | undefined;

export function createBrowserSupabaseClient() {
  if (browserClient) {
    return browserClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Missing public Supabase environment variables.");
  }

  browserClient = createClient<Database>(
    supabaseUrl,
    supabasePublishableKey,
  );

  return browserClient;
}
