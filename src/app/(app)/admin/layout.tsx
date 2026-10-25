import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth";

// Every admin page re-checks the session; server actions check again on their own.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
