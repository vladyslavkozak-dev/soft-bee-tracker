import { PageHeader } from '@components/common/page-header/page-header';
import { CrewTable } from '@components/crew/crew-table/crew-table';
import { InviteMemberDialog } from '@components/crew/invite-member-dialog/invite-member-dialog';
import { ROUTES } from '@/constants';
import { requireRouteAccess } from '@/lib/api/auth/server';
import content from './content.json';

export default async function CrewPage() {
  await requireRouteAccess(ROUTES.CREW);

  return (
    <>
      <PageHeader eyebrow={content.eyebrow} title={content.title} description={content.description} actions={<InviteMemberDialog />} />
      <CrewTable />
    </>
  );
}
