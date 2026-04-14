/**
 * Live subscription to materials for a project, optionally filtered by category.
 */
import { useEffect, useState } from 'react';
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

import { db } from '@/src/lib/firebase';

import type { Material } from './types';

export type UseMaterialsResult = {
  data: Material[];
  loading: boolean;
};

export function useMaterials(
  projectId: string | undefined,
  category?: string,
): UseMaterialsResult {
  const [data, setData] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let query = db
      .collection('materials')
      .where('projectId', '==', projectId) as FirebaseFirestoreTypes.Query;

    if (category) {
      query = query.where('category', '==', category);
    }

    const unsub = query.onSnapshot(
      (snap) => {
        const rows: Material[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Material, 'id'>),
        }));
        rows.sort((a, b) => {
          const at = a.createdAt ? a.createdAt.toMillis() : Number.MAX_SAFE_INTEGER;
          const bt = b.createdAt ? b.createdAt.toMillis() : Number.MAX_SAFE_INTEGER;
          return bt - at;
        });
        setData(rows);
        setLoading(false);
      },
      (err) => {
        console.warn('[useMaterials] snapshot error:', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [projectId, category]);

  return { data, loading };
}
