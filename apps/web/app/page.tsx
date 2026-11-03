import { redirect } from "next/navigation";
import { LibraryApp } from "@/components/library-app";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`Não foi possível verificar sua sessão: ${error.message}`);
  }
  if (!data.user) {
    redirect("/login");
  }

  return <LibraryApp userEmail={data.user.email ?? ""} />;
}
