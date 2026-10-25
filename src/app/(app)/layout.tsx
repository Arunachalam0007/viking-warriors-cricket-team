import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getViewer } from "@/lib/auth";
import { getSetting } from "@/modules/settings/settings";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [viewer, teamName] = await Promise.all([getViewer(), getSetting("team_name")]);
  return (
    <SidebarProvider>
      <AppSidebar viewer={viewer} teamName={teamName} />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur pt-[env(safe-area-inset-top)] box-content">
          <SidebarTrigger className="-ml-1" />
          <span className="font-heading text-lg font-bold tracking-wide md:hidden">{teamName}</span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl min-w-0 px-4 pt-5 pb-24 md:px-6 md:pb-10">{children}</main>
      </SidebarInset>
      <MobileNav />
    </SidebarProvider>
  );
}
