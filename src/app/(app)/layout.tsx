import { SidebarInset, SidebarProvider } from '@ui/sidebar';
import { AppHeader } from '@components/layout/app-header/app-header';
import { AppSidebar } from '@components/layout/app-sidebar/app-sidebar';
import { LiveTrackerWidget } from '@components/tracker/live-tracker/live-tracker-widget';
import { getRouteSession, getSessionProfile } from '@/lib/api/auth/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // both cached per request, so the page's requireRouteAccess reuses them
  const [profile, session] = await Promise.all([getSessionProfile(), getRouteSession()]);

  if (!profile) {
    return <main className='flex min-h-screen flex-col items-center justify-center p-6'>{children}</main>;
  }

  return (
    <SidebarProvider>
      <AppSidebar profile={profile} role={session?.role ?? null} />
      <SidebarInset>
        <AppHeader profile={profile} />
        <main className='mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8 lg:pb-24'>
          {children}
        </main>
      </SidebarInset>
      <LiveTrackerWidget />
    </SidebarProvider>
  );
}
