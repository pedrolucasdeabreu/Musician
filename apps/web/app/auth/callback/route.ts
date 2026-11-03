import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const destination = request.nextUrl.searchParams.get("next") ?? "/";
  const safeDestination = destination.startsWith("/") && !destination.startsWith("//")
    ? destination
    : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("Não foi possível concluir o login. Tente novamente.")}`, request.url));
    }
  }

  return NextResponse.redirect(new URL(safeDestination, request.url));
}
