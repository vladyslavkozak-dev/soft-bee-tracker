import { ChartColumnIcon, ClockIcon, FolderKanbanIcon, UserIcon, UsersIcon, type LucideIcon } from 'lucide-react';

import { ROUTES } from '@/constants';
import type { UserRole } from '@/lib/api/auth';
import { canRoleAccessRoute, matchesRoute } from '@/lib/route-access';
import content from './content.json';

export const NAV_ITEMS: NavItem[] = [
  { title: content.navigation.tracker, href: ROUTES.TRACKER, icon: ClockIcon },
  { title: content.navigation.crew, href: ROUTES.CREW, icon: UsersIcon },
  { title: content.navigation.reports, href: ROUTES.REPORTS, icon: ChartColumnIcon },
  { title: content.navigation.projects, href: ROUTES.PROJECTS, icon: FolderKanbanIcon }
];

const SECTION_ITEMS: NavItem[] = [...NAV_ITEMS, { title: content.navigation.profile, href: ROUTES.PROFILE, icon: UserIcon }];

// hides links the role can't open; the proxy, page checks and RLS still enforce access
export function getVisibleNavItems(role: UserRole | null): NavItem[] {
  return NAV_ITEMS.filter((item) => canRoleAccessRoute(item.href, role));
}

export function isNavItemActive(pathname: string, href: string): boolean {
  return matchesRoute(pathname, href);
}

export function findSectionItem(pathname: string): NavItem | undefined {
  return SECTION_ITEMS.find((item) => isNavItemActive(pathname, item.href));
}

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}
