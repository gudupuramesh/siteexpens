/**
 * Live subscription to laminates for a project, grouped by room.
 */
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/src/lib/firebase';
import type { Laminate, RoomLaminates } from './types';

export type UseLaminatesResult = {
  data: Laminate[];
  rooms: RoomLaminates[];
  roomNames: string[];
  loading: boolean;
};

export function useLaminates(projectId: string | undefined): UseLaminatesResult {
  const [data, setData] = useState<Laminate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = db
      .collection('laminates')
      .where('projectId', '==', projectId)
      .onSnapshot(
        (snap) => {
          const rows: Laminate[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Laminate, 'id'>),
          }));
          rows.sort((a, b) => {
            const cmp = a.roomName.localeCompare(b.roomName);
            if (cmp !== 0) return cmp;
            const at = a.createdAt ? a.createdAt.toMillis() : 0;
            const bt = b.createdAt ? b.createdAt.toMillis() : 0;
            return bt - at;
          });
          setData(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useLaminates] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [projectId]);

  const rooms = useMemo(() => {
    const map = new Map<string, Laminate[]>();
    for (const l of data) {
      const arr = map.get(l.roomName) ?? [];
      arr.push(l);
      map.set(l.roomName, arr);
    }
    return Array.from(map.entries()).map(([roomName, laminates]) => ({
      roomName,
      laminates,
    }));
  }, [data]);

  const roomNames = useMemo(() => rooms.map((r) => r.roomName), [rooms]);

  return { data, rooms, roomNames, loading };
}
