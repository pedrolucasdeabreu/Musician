import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error("Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.");
}

export const supabase = createClient(url, key, {
  auth: {
    flowType: "pkce",
    detectSessionInUrl: !Capacitor.isNativePlatform(),
    autoRefreshToken: true,
    persistSession: true,
  },
});
