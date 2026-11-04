import Image from "next/image";
import Link from "next/link";
import { AskViking } from "@/components/ai/ask-viking";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { HeaderCricketScene } from "@/components/layout/header-cricket";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getViewer } from "@/lib/auth";
import { configuredProviders } from "@/modules/ai/models";
import { getSettings } from "@/modules/settings/settings";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [viewer, settings] = await Promise.all([getViewer(), getSettings()]);
  const teamName = settings.team_name;
  const isAdmin = viewer?.isAdmin ?? false;
  // AI-Viking-Bot: on when AI is enabled, a provider key is set, and the public chat is on (admins always)
  const askViking = settings.ai_enabled && configuredProviders().length > 0 && (settings.ai_public_chat || isAdmin);
  return (
    <SidebarProvider>
      <AppSidebar viewer={viewer} teamName={teamName} />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 overflow-hidden border-b bg-background/90 px-4 backdrop-blur pt-[env(safe-area-inset-top)] box-content">
          <SidebarTrigger className="relative z-10 -ml-1" />
          {/* Logo + name on phones; the desktop sidebar already shows them */}
          <Link href="/" className="relative z-10 flex shrink-0 items-center gap-2 md:hidden">
            <Image src="/team-logo.jpeg" alt="" width={72} height={72} priority className="size-9 shrink-0 rounded-lg bg-white object-contain ring-1 ring-black/5" />
            <span className="truncate font-heading text-lg font-bold tracking-wide">{teamName}</span>
          </Link>
          <HeaderCricketScene />
          <div className="relative z-10 flex shrink-0 items-center gap-1">
            <ThemeToggle />
          </div>
        </header>
        {/* SidebarInset is already the page's <main>. overflow-x-clip: cards sliding in sideways never widen the page. */}
        <div className="mx-auto w-full max-w-6xl min-w-0 overflow-x-clip px-4 pt-5 pb-24 md:px-6 md:pb-28">{children}</div>
      </SidebarInset>
      <MobileNav />
      {askViking && <AskViking isAdmin={isAdmin} teamName={teamName} />}
    </SidebarProvider>
  );
}
