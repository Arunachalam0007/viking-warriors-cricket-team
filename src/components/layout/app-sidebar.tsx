"use client";

import { LogIn, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ADMIN_NAV, isActive, PUBLIC_NAV, type NavItem } from "./nav-items";

export function AppSidebar({ viewer, teamName }: { viewer: { email: string; isAdmin: boolean } | null; teamName: string }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const renderItems = (items: NavItem[]) =>
    items.map((item) => (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton asChild isActive={isActive(pathname, item.href)} tooltip={item.label}>
          <Link href={item.href} onClick={() => setOpenMobile(false)}>
            <item.icon />
            <span>{item.label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/" className="flex items-center gap-2 px-1 py-1.5" onClick={() => setOpenMobile(false)}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary font-heading text-lg font-bold text-sidebar-primary-foreground">
            VW
          </span>
          <span className="truncate font-heading text-xl font-bold tracking-wide group-data-[collapsible=icon]:hidden">
            {teamName}
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Team</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(PUBLIC_NAV)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {viewer?.isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(ADMIN_NAV)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {viewer ? (
            <>
              <SidebarMenuItem>
                <div className="flex items-center gap-2 px-2 py-1 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
                  <ShieldCheck className="size-4 shrink-0" />
                  <span className="truncate">{viewer.email}</span>
                </div>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <form action="/auth/signout" method="post">
                  <SidebarMenuButton type="submit" tooltip="Sign out">
                    <LogOut />
                    <span>Sign out</span>
                  </SidebarMenuButton>
                </form>
              </SidebarMenuItem>
            </>
          ) : (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Admin login">
                <Link href="/login" onClick={() => setOpenMobile(false)}>
                  <LogIn />
                  <span>Admin login</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
