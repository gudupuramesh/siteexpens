/**
 * Real-time subscription to org-scoped material library.
 * Supports optional client-side text search.
 */
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/src/lib/firebase';
import type { MaterialCategory, MaterialLibraryItem } from './types';
import { getCategoryConfig } from './types';

export type UseMaterialLibraryResult = {
  data: MaterialLibraryItem[];
  loading: boolean;
};

export function useMaterialLibrary(
  orgId: string | undefined,
  searchText?: string,
  category?: MaterialCategory,
): UseMaterialLibraryResult {
  const [raw, setRaw] = useState<MaterialLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setRaw([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = db
      .collection('materialLibrary')
      .where('orgId', '==', orgId);
    if (category) {
      query = query.where('category', '==', category);
    }
    const unsub = query.onSnapshot(
        (snap) => {
          const rows: MaterialLibraryItem[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<MaterialLibraryItem, 'id'>),
          }));
          rows.sort((a, b) => a.name.localeCompare(b.name));
          setRaw(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useMaterialLibrary] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [orgId, category]);

  const data = useMemo(() => {
    if (!searchText?.trim()) return raw;
    const q = searchText.toLowerCase();
    return raw.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.variety.toLowerCase().includes(q) ||
        item.make.toLowerCase().includes(q) ||
        getCategoryConfig(item.category).label.toLowerCase().includes(q),
    );
  }, [raw, searchText]);

  return { data, loading };
}
