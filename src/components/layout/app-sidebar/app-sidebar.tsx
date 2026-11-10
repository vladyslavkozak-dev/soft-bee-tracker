'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
  SidebarRail,
  useSidebar
} from '@ui/sidebar';
import { LogoMark } from '@/assets/icons/logo-mark';
import { NavUser } from '@components/layout/app-sidebar/nav-user';
import { getVisibleNavItems, isNavItemActive } from '@components/layout/navigation';
import { ROUTES } from '@/constants';
import type { UserProfile, UserRole } from '@/lib/api/auth';
import content from '../content.json';

interface AppSidebarProps {
  profile: UserProfile;
  // from the user_role claim (getRouteSession), not profile.role, so links match the proxy
  role: UserRole | null;
}

export function AppSidebar({ profile, role }: AppSidebarProps) {
  const pathname = usePathname();
  const navItems = getVisibleNavItems(role);
  const { isMobile, setOpenMobile } = useSidebar();

  function handleNavigate() {
    if (isMobile) {
      setOpenMobile(false);
    }
  }

  return (
    <Sidebar collapsible='icon' variant='inset'>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size='lg'
              tooltip={content.sidebar.appName}
              className='hover:bg-transparent active:bg-transparent'
              render={<Link href={ROUTES.TRACKER} onClick={handleNavigate} />}
            >
              <div className='bg-electric-green text-brand-black shadow-glow flex aspect-square size-8 items-center justify-center rounded-full'>
                <LogoMark className='h-4.5 w-auto' />
              </div>
              <div className='grid flex-1 text-left leading-tight'>
                <span className='truncate font-semibold tracking-tight'>{content.sidebar.brandName}</span>
                <span className='text-muted-foreground truncate text-xs'>{content.sidebar.brandSuffix}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{content.sidebar.workspaceGroup}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className='gap-1'>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isNavItemActive(pathname, item.href)}
                    tooltip={item.title}
                    className='data-active:bg-sidebar-accent h-9 transition-all data-active:font-medium data-active:shadow-sm'
                    render={<Link href={item.href} onClick={handleNavigate} />}
                  >
                    <item.icon className='in-data-active:text-deep-teal dark:in-data-active:text-electric-green' />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser profile={profile} onNavigate={handleNavigate} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
