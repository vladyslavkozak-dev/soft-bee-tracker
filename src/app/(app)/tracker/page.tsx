import { PageHeader } from '@components/common/page-header/page-header';
import { CreateTrackerDialog } from '@components/tracker/create-tracker-dialog/create-tracker-dialog';
import { TrackerOverview } from '@components/tracker/tracker-overview/tracker-overview';
import { TrackerWorkspace } from '@components/tracker/tracker-workspace/tracker-workspace';
import { ROUTES } from '@/constants';
import { requireRouteAccess } from '@/lib/api/auth/server';
import { formatText } from '@/lib/format-text';
import content from './content.json';

export default async function TrackerPage() {
  const profile = await requireRouteAccess(ROUTES.TRACKER);

  return (
    <>
      <PageHeader
        eyebrow={content.eyebrow}
        title={formatText(content.greeting, { name: profile.firstName || profile.username })}
        description={content.description}
        actions={<CreateTrackerDialog />}
      />
      <TrackerOverview />
      <TrackerWorkspace />
    </>
  );
}
