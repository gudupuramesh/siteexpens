import type { RoleKey } from '@/src/features/org/types';

/** Admin / Super Admin / Manager: material request is approved on create. */
export function materialAutoApprovesOnCreate(role: RoleKey): boolean {
  return role === 'superAdmin' || role === 'admin' || role === 'manager';
}
