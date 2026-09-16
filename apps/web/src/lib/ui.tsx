/**
 * Backwards-compatible entry points for the app frame.
 *
 * Product code that imported `<Shell>`, `<PageTitle>` or `<Protected>` from here
 * keeps working — they now delegate to the redesigned DS v2 components, so all
 * ~30 existing pages inherit the new shell without being touched.
 *
 * New code should import from `components/layout` and `components/patterns`.
 */
import { Navigate } from 'react-router-dom';
import { LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from './auth';
import type { Permission } from '@mentis/core';
import { AppShell } from '../components/layout/app-shell';
import { PageHeader, type PageHeaderProps } from '../components/patterns/page-header';
import { EmptyState } from '../components/ui/empty-state';
import { Button } from '../components/ui/button';
import { SkeletonPage } from '../components/ui/skeleton';

export { AppShell as Shell } from '../components/layout/app-shell';
export { PageHeader } from '../components/patterns/page-header';
export { PageTransition, Reveal } from '../components/patterns/page-transition';

/** Route guard: skeleton while auth resolves, then a helpful state, never a dead end. */
export function Protected({ perm, children }: { perm?: Permission; children: React.ReactElement }) {
  const { userId, staff, role, loading, canDo, signOut } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto max-w-[var(--content-max)] p-5">
        <SkeletonPage />
      </div>
    );
  }
  if (!userId) return <Navigate to="/login" replace />;

  // Outside the shell on purpose: these states should not look like a working app.
  const blocking = !staff || !role || (perm && !canDo(perm));
  if (blocking) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg px-4">
        <div className="card w-full max-w-lg p-2">
          <EmptyState
            icon={ShieldAlert}
            tone={perm && !canDo(perm) ? 'warning' : 'danger'}
            title={
              !staff
                ? 'No Mentis staff record'
                : !role
                  ? 'No role assigned'
                  : perm && !canDo(perm)
                    ? 'Not permitted'
                    : 'Access blocked'
            }
            description={
              !staff
                ? 'Your Rally account is signed in, but it is not linked to a Mentis staff record yet. Ask a Super Admin to assign your roles.'
                : !role
                  ? 'This account has no Mentis role. Ask a Super Admin to assign one.'
                  : `The ${role} role does not include “${perm}”. Switch role from the account menu, or ask a Super Admin to extend your roles.`
            }
            action={
              <Button intent="secondary" size="sm" iconLeft={<LogOut />} onClick={() => void signOut()}>
                Sign out
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return children;
}

/** @deprecated use `<PageHeader>` — kept so existing pages keep compiling. */
export function PageTitle(props: { title: string; sub?: string; right?: React.ReactNode }) {
  const headerProps: PageHeaderProps = { title: props.title, subtitle: props.sub, actions: props.right };
  return <PageHeader {...headerProps} />;
}
