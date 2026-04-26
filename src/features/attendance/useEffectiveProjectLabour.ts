/**
 * Effective project labour roster.
 *
 * Combines:
 *   1. Formal `projectLabour` collection docs (source of truth, supports
 *      disable/edit).
 *   2. Distinct labour derived from any `attendance` doc in the project
 *      (fallback so historical labour added before the roster system was
 *      introduced still appears on every date).
 *
 * Also performs a silent, idempotent backfill: any derived labour without a
 * formal roster entry is upserted to `projectLabour` once. This converges the
 * data model without blocking the UI.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { AttendanceRecord, ProjectLabour } from './types';
import { upsertProjectLabour } from './attendance';

export type UseEffectiveProjectLabourResult = {
  data: ProjectLabour[];
  loading: boolean;
};

type DerivedLabour = Pick<
  ProjectLabour,
  'orgId' | 'projectId' | 'labourId' | 'labourName' | 'labourRole'
> & {
  description?: string;
  payRate?: number;
  payUnit?: 'day' | 'hour';
  createdBy: string;
  latestDate: string;
};

export function useEffectiveProjectLabour(
  projectId: string | undefined,
  orgId: string | undefined,
): UseEffectiveProjectLabourResult {
  const [roster, setRoster] = useState<ProjectLabour[]>([]);
  const [derived, setDerived] = useState<Map<string, DerivedLabour>>(new Map());
  const [rosterLoading, setRosterLoading] = useState(true);
  const [derivedLoading, setDerivedLoading] = useState(true);
  const backfilledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // orgId is required by Firestore rules — list queries must include
    // the same field the rule reads (resource.data.orgId).
    if (!projectId || !orgId) {
      setRoster([]);
      setRosterLoading(false);
      return;
    }
    setRosterLoading(true);
    const unsub = db
      .collection('projectLabour')
      .where('orgId', '==', orgId)
      .where('projectId', '==', projectId)
      .onSnapshot(
        (snap) => {
          const rows = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ProjectLabour, 'id'>),
          }));
          setRoster(rows);
          setRosterLoading(false);
        },
        (err) => {
          console.warn('[useEffectiveProjectLabour] roster snapshot error:', err);
          setRosterLoading(false);
        },
      );
    return unsub;
  }, [projectId, orgId]);

  useEffect(() => {
    if (!projectId || !orgId) {
      setDerived(new Map());
      setDerivedLoading(false);
      return;
    }
    setDerivedLoading(true);
    const unsub = db
      .collection('attendance')
      .where('orgId', '==', orgId)
      .where('projectId', '==', projectId)
      .onSnapshot(
        (snap) => {
          const map = new Map<string, DerivedLabour>();
          for (const d of snap.docs) {
            const r = d.data() as Omit<AttendanceRecord, 'id'>;
            const labourId = r.labourId;
            if (!labourId) continue;
            const prev = map.get(labourId);
            if (!prev || (r.date && r.date > prev.latestDate)) {
              map.set(labourId, {
                orgId: r.orgId,
                projectId: r.projectId,
                labourId,
                labourName: r.labourName,
                labourRole: r.labourRole,
                description: r.description,
                payRate: r.payRate,
                payUnit: r.payUnit,
                createdBy: r.createdBy,
                latestDate: r.date ?? '',
              });
            }
          }
          setDerived(map);
          setDerivedLoading(false);
        },
        (err) => {
          console.warn('[useEffectiveProjectLabour] derived snapshot error:', err);
          setDerivedLoading(false);
        },
      );
    return unsub;
  }, [projectId, orgId]);

  // Silent, idempotent backfill of `projectLabour` for any derived labour
  // that doesn't already have a formal roster doc. Done once per labourId
  // per session.
  useEffect(() => {
    if (!projectId || derivedLoading || rosterLoading) return;
    const rosterIds = new Set(roster.map((r) => r.labourId));
    derived.forEach((d) => {
      if (rosterIds.has(d.labourId)) return;
      if (backfilledRef.current.has(d.labourId)) return;
      backfilledRef.current.add(d.labourId);
      upsertProjectLabour({
        orgId: d.orgId,
        projectId: d.projectId,
        labourId: d.labourId,
        labourName: d.labourName,
        labourRole: d.labourRole,
        description: d.description,
        payRate: d.payRate,
        payUnit: d.payUnit,
        createdBy: d.createdBy,
        disabled: false,
      }).catch((err) => {
        console.warn('[useEffectiveProjectLabour] backfill error:', err);
        backfilledRef.current.delete(d.labourId);
      });
    });
  }, [derived, derivedLoading, projectId, roster, rosterLoading]);

  const data = useMemo<ProjectLabour[]>(() => {
    const byId = new Map<string, ProjectLabour>();
    for (const r of roster) {
      byId.set(r.labourId, r);
    }
    derived.forEach((d) => {
      if (byId.has(d.labourId)) return;
      byId.set(d.labourId, {
        id: `${d.projectId}_${d.labourId}`,
        orgId: d.orgId,
        projectId: d.projectId,
        labourId: d.labourId,
        labourName: d.labourName,
        labourRole: d.labourRole,
        description: d.description,
        payRate: d.payRate,
        payUnit: d.payUnit,
        disabled: false,
        createdBy: d.createdBy,
        createdAt: null,
      });
    });
    const merged = Array.from(byId.values()).filter((row) => !row.disabled);
    merged.sort((a, b) => a.labourName.localeCompare(b.labourName));
    return merged;
  }, [roster, derived]);

  return { data, loading: rosterLoading || derivedLoading };
}
