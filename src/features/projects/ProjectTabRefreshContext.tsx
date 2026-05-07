import { createContext, useContext, type ReactNode } from 'react';

/**
 * Bumped when the project detail screen regains focus so tab hooks can
 * resubscribe Firestore listeners (safety net when virtualization or stack
 * transitions left snapshots stale).
 */
const ProjectTabRefreshContext = createContext(0);

export function ProjectTabRefreshProvider({
  refreshKey,
  children,
}: {
  refreshKey: number;
  children: ReactNode;
}) {
  return (
    <ProjectTabRefreshContext.Provider value={refreshKey}>
      {children}
    </ProjectTabRefreshContext.Provider>
  );
}

export function useProjectTabRefreshKey(): number {
  return useContext(ProjectTabRefreshContext);
}
