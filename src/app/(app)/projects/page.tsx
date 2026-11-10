import { PageHeader } from '@components/common/page-header/page-header';
import { CreateProjectDialog } from '@components/projects/create-project-dialog/create-project-dialog';
import { UserProjectsList } from '@components/projects/user-projects-list';
import { ROUTES } from '@/constants';
import { requireRouteAccess } from '@/lib/api/auth/server';
import content from './content.json';

export default async function ProjectsPage() {
  await requireRouteAccess(ROUTES.PROJECTS);

  return (
    <>
      <PageHeader eyebrow={content.eyebrow} title={content.title} description={content.description} actions={<CreateProjectDialog />} />
      <UserProjectsList />
    </>
  );
}
