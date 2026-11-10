import { PageHeader } from '@components/common/page-header/page-header';
import { ReportsView } from '@components/reports/reports-view/reports-view';
import { ROUTES } from '@/constants';
import { requireRouteAccess } from '@/lib/api/auth/server';
import content from './content.json';

export default async function ReportsPage() {
  await requireRouteAccess(ROUTES.REPORTS);

  return (
    <>
      <PageHeader eyebrow={content.eyebrow} title={content.title} description={content.description} />
      <ReportsView />
    </>
  );
}
