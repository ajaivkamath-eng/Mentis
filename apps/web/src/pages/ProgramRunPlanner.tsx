import { SessionTemplates } from './templates';

/**
 * Blueprint/program-run workspace entry point. The underlying route-aware
 * blueprint library also serves the legacy /program-blueprints route.
 */
export function ProgramRunPlannerPage() {
  return <SessionTemplates />;
}
