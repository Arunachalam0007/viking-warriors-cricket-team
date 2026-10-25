import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient, supabaseConfigured } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (supabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), { status: 303 });
}
