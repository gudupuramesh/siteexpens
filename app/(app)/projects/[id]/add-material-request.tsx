/**
 * Create Material Request — pick items from library or add manually,
 * set quantities and rates, submit for approval.
 * Category-aware: library picker filters by category, manual form shows
 * category-specific fields.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useGuardedRoute } from "@/src/features/org/useGuardedRoute";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/src/features/auth/useAuth';
import { can as roleCan } from '@/src/features/org/permissions';
import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useOrgMembers } from '@/src/features/org/useOrgMembers';
import { usePermissions } from '@/src/features/org/usePermissions';
import type { Organization, RoleKey } from '@/src/features/org/types';
import { useMaterialLibrary } from '@/src/features/materialLibrary/useMaterialLibrary';
import { createLibraryItem } from '@/src/features/materialLibrary/materialLibrary';
import {
  createMaterialRequest,
  resubmitRejectedRequest,
  updateMaterialRequest,
} from '@/src/features/materialRequests/materialRequests';
import { materialAutoApprovesOnCreate } from '@/src/features/materialRequests/materialApproval';
import type { MaterialLibraryItem, MaterialCategory } from '@/src/features/materialLibrary/types';
import { MATERIAL_CATEGORIES, getCategoryConfig } from '@/src/features/materialLibrary/types';
import type { MaterialRequestItem } from '@/src/features/materialRequests/types';
import { useMaterialRequest } from '@/src/features/materialRequests/useMaterialRequest';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { SubmitProgressOverlay } from '@/src/ui/SubmitProgressOverlay';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { color, radius, screenInset, space } from '@/src/theme';

const UNITS = ['pcs', 'kg', 'bags', 'sqft', 'rft', 'cft', 'litres', 'meters', 'tons', 'sets'];

function resolveOrgMemberRole(uid: string, org: Organization | null): RoleKey | null {
  if (!org) return null;
  const explicit = org.roles?.[uid];
  if (explicit) return explicit;
  if (org.ownerId === uid) return 'superAdmin';
  if (org.memberIds?.includes(uid)) return 'admin';
  return null;
}

type CategoryFilter = 'all' | MaterialCategory;

type RequestLineItem = MaterialRequestItem & { _key: string };

export default function AddMaterialRequestScreen() {
  useGuardedRoute({ capability: 'material.request.write' });
  const { id: projectId, reqId, resubmit } = useLocalSearchParams<{
    id: string;
    reqId?: string;
    resubmit?: string;
  }>();
  const isResubmitting = resubmit === '1';
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: org } = useCurrentOrganization();
  const { role } = usePermissions();
  const { members } = useOrgMembers(orgId || undefined);

  const [title, setTitle] = useState('');
  const [designatedApproverUids, setDesignatedApproverUids] = useState<string[]>([]);
  const [items, setItems] = useState<RequestLineItem[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isEditMode = !!reqId;
  const prefilledRef = useRef(false);
  const { data: existingRequest, loading: requestLoading } = useMaterialRequest(reqId);

  const totalValue = items.reduce((s, i) => s + i.totalCost, 0);

  const materialApproverChoices = useMemo(() => {
    if (!org) return [];
    return members.filter((m) =>
      roleCan(resolveOrgMemberRole(m.uid, org), 'material.request.approve'),
    );
  }, [members, org]);

  const needsMaterialApproval = !!role && !materialAutoApprovesOnCreate(role);

  useEffect(() => {
    if (!isEditMode || !existingRequest || prefilledRef.current) return;
    setTitle(existingRequest.title ?? '');
    setItems(
      existingRequest.items.map((item, idx) => ({
        ...item,
        _key: `${item.libraryItemId ?? item.name}_${idx}_${Date.now()}`,
      })),
    );
    prefilledRef.current = true;
  }, [existingRequest, isEditMode]);

  // ── Add from library ──
  const addFromLibrary = useCallback((lib: MaterialLibraryItem) => {
    const exists = items.some((i) => i.libraryItemId === lib.id);
    if (exists) {
      Alert.alert('Already added', `${lib.name} is already in the list.`);
      return;
    }
    const newItem: RequestLineItem = {
      _key: `${lib.id}_${Date.now()}`,
      libraryItemId: lib.id,
      category: lib.category ?? 'other',
      name: lib.name,
      brand: lib.brand,
      variety: lib.variety,
      make: lib.make,
      size: lib.size,
      unit: lib.unit,
      quantity: 1,
      rate: lib.defaultRate ?? 0,
      totalCost: lib.defaultRate ?? 0,
      deliveryStatus: 'pending',
    };
    setItems((prev) => [...prev, newItem]);
    setShowLibrary(false);
  }, [items]);

  // ── Add manual item ──
  const addManualItem = useCallback((item: RequestLineItem) => {
    setItems((prev) => [...prev, item]);
    setShowManual(false);
  }, []);

  // ── Update quantity/rate ──
  const updateItem = useCallback((key: string, field: 'quantity' | 'rate', val: string) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i._key !== key) return i;
        const num = parseFloat(val) || 0;
        const updated = { ...i, [field]: num };
        updated.totalCost = updated.quantity * updated.rate;
        return updated;
      }),
    );
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => i._key !== key));
  }, []);

  // ── Submit ──
  async function onSubmit() {
    if (!user || !orgId || !projectId || items.length === 0) return;
    if (!isEditMode && !role) {
      Alert.alert('Role unavailable', 'Your studio role could not be loaded. Try again.');
      return;
    }
    setSubmitting(true);
    try {
      if (isEditMode && reqId) {
        if (isResubmitting && existingRequest?.status === 'rejected') {
          // Creator is pushing a previously-rejected request back into the
          // approval queue. The writer flips status to 'pending' and clears
          // the rejection note; the trigger sees the rejected→pending
          // transition and re-fires the approver push.
          await resubmitRejectedRequest({
            requestId: reqId,
            title,
            items: items.map(({ _key, ...rest }) => rest),
            editedBy: user.uid,
          });
        } else {
          await updateMaterialRequest({
            requestId: reqId,
            title,
            items: items.map(({ _key, ...rest }) => rest),
            editedBy: user.uid,
          });
        }
      } else {
        const newId = await createMaterialRequest({
          orgId,
          projectId,
          title,
          items: items.map(({ _key, ...rest }) => rest),
          createdBy: user.uid,
          creatorRole: role!,
          designatedApproverUids:
            designatedApproverUids.length > 0 ? designatedApproverUids : undefined,
        });
        await new Promise((r) => setTimeout(r, 150));
        router.replace(`/(app)/projects/${projectId}/material-request/${newId}` as never);
        return;
      }
      await new Promise((r) => setTimeout(r, 150));
      router.back();
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.surface }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav */}
      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="close" size={22} color={color.text} />
        </Pressable>
        <Text variant="bodyStrong" color="text" style={styles.navTitle}>
          {isResubmitting
            ? 'Edit & Re-submit'
            : isEditMode
              ? 'Edit Material Request'
              : 'New Material Request'}
        </Text>
        <View style={styles.navBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {isResubmitting && existingRequest?.rejectionNote ? (
            <View style={styles.rejectionBanner}>
              <Ionicons name="close-circle" size={18} color={color.danger} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="metaStrong" color="danger">
                  Previously rejected
                </Text>
                <Text variant="meta" color="text">
                  {existingRequest.rejectionNote}
                </Text>
                <Text variant="caption" color="textMuted">
                  Address the feedback above and submit again — approvers will be notified.
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text variant="caption" color="textMuted">ITEMS ADDED</Text>
              <Text variant="metaStrong" color="text">{items.length}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text variant="caption" color="textMuted">TOTAL VALUE</Text>
              <Text variant="bodyStrong" color="primary">₹{totalValue.toLocaleString('en-IN')}</Text>
            </View>
          </View>

          {/* Title */}
          <TextField
            label="Request Title (optional)"
            placeholder="e.g. Week 12 Cement Order"
            autoCapitalize="words"
            value={title}
            onChangeText={setTitle}
          />

          {!isEditMode && needsMaterialApproval && materialApproverChoices.length > 0 ? (
            <View style={styles.approverSection}>
              <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
                NOTIFY APPROVERS (OPTIONAL)
              </Text>
              <Text variant="meta" color="textMuted" style={styles.approverHint}>
                Any Manager, Admin, or Super Admin can approve. Selected members get a heads-up in
                notifications.
              </Text>
              {materialApproverChoices.map((m) => {
                const on = designatedApproverUids.includes(m.uid);
                return (
                  <Pressable
                    key={m.uid}
                    onPress={() =>
                      setDesignatedApproverUids((prev) =>
                        prev.includes(m.uid) ? prev.filter((u) => u !== m.uid) : [...prev, m.uid],
                      )
                    }
                    style={[styles.approverRow, on && styles.approverRowOn]}
                  >
                    <Ionicons
                      name={on ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={on ? color.primary : color.textMuted}
                    />
                    <Text variant="metaStrong" color="text" style={{ flex: 1 }}>
                      {m.displayName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Add buttons */}
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>ITEMS</Text>
          <View style={styles.addRow}>
            <Pressable onPress={() => setShowLibrary(true)} style={styles.addBtn}>
              <Ionicons name="library-outline" size={18} color={color.primary} />
              <Text variant="metaStrong" color="primary">From Library</Text>
            </Pressable>
            <Pressable onPress={() => setShowManual(true)} style={styles.addBtn}>
              <Ionicons name="create-outline" size={18} color={color.primary} />
              <Text variant="metaStrong" color="primary">Add Manually</Text>
            </Pressable>
          </View>

          {/* Items list */}
          {items.length === 0 ? (
            <View style={styles.emptyItems}>
              <Ionicons name="cube-outline" size={28} color={color.textFaint} />
              <Text variant="meta" color="textMuted" align="center">
                No items added. Pick from library or add manually.
              </Text>
            </View>
          ) : (
            items.map((item) => {
              const catConfig = item.category ? getCategoryConfig(item.category as MaterialCategory) : null;
              return (
                <View key={item._key} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <View style={styles.flex}>
                      <View style={styles.itemTitleRow}>
                        {catConfig && (
                          <View style={[styles.catDot, { backgroundColor: catConfig.color }]} />
                        )}
                        <Text variant="rowTitle" color="text" numberOfLines={1}>{item.name}</Text>
                      </View>
                      <Text variant="caption" color="textMuted" numberOfLines={1}>
                        {[item.brand, item.variety, item.size].filter(Boolean).join(' · ') || '—'}
                      </Text>
                    </View>
                    <Pressable onPress={() => removeItem(item._key)} hitSlop={10}>
                      <Ionicons name="close-circle" size={20} color={color.danger} />
                    </Pressable>
                  </View>

                  <View style={styles.itemInputs}>
                    <View style={styles.inputGroup}>
                      <Text variant="caption" color="textMuted">Qty</Text>
                      <TextInput
                        style={styles.numInput}
                        keyboardType="numeric"
                        value={item.quantity > 0 ? String(item.quantity) : ''}
                        onChangeText={(v) => updateItem(item._key, 'quantity', v)}
                        placeholder="0"
                        placeholderTextColor={color.textFaint}
                      />
                      <Text variant="caption" color="textMuted">{item.unit}</Text>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text variant="caption" color="textMuted">₹ Rate</Text>
                      <TextInput
                        style={styles.numInput}
                        keyboardType="numeric"
                        value={item.rate > 0 ? String(item.rate) : ''}
                        onChangeText={(v) => updateItem(item._key, 'rate', v)}
                        placeholder="0"
                        placeholderTextColor={color.textFaint}
                      />
                    </View>

                    <View style={styles.totalGroup}>
                      <Text variant="caption" color="textMuted">Total</Text>
                      <Text variant="metaStrong" color="text">
                        ₹{item.totalCost.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}

          {/* Grand total */}
          {items.length > 0 && (
            <View style={styles.grandTotal}>
              <Text variant="bodyStrong" color="text">Total Value</Text>
              <Text variant="bodyStrong" color="primary">
                ₹{totalValue.toLocaleString('en-IN')}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Button
            label={`${
              isEditMode
                ? 'Update Request'
                : needsMaterialApproval
                  ? 'Submit for approval'
                  : 'Submit request'
            }${items.length > 0 ? ` (${items.length} items)` : ''}`}
            onPress={onSubmit}
            loading={submitting}
            disabled={items.length === 0 || (isEditMode && requestLoading)}
          />
        </View>
      </KeyboardAvoidingView>

      {/* Library Picker */}
      <LibraryPickerModal
        visible={showLibrary}
        orgId={orgId}
        onSelect={addFromLibrary}
        onClose={() => setShowLibrary(false)}
      />

      {/* Manual Item Modal */}
      <ManualItemModal
        visible={showManual}
        orgId={orgId}
        userId={user?.uid ?? ''}
        onAdd={addManualItem}
        onClose={() => setShowManual(false)}
      />

      <SubmitProgressOverlay
        visible={submitting}
        intent="submitMaterialRequest"
      />
    </Screen>
  );
}

// ── Library Picker Modal ──

function LibraryPickerModal({
  visible,
  orgId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  orgId: string;
  onSelect: (item: MaterialLibraryItem) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<CategoryFilter>('all');
  const activeCat = catFilter === 'all' ? undefined : catFilter;
  const { data: items, loading } = useMaterialLibrary(orgId, search, activeCat);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            Keyboard.dismiss();
            onClose();
          }}
        >
          <View />
        </Pressable>
        <View style={styles.modalSheet}>
        <View style={styles.modalHandle} />
        <Text variant="bodyStrong" color="text" style={styles.modalTitle}>
          Material Library
        </Text>

        <View style={styles.modalSearch}>
          <Ionicons name="search" size={18} color={color.textMuted} />
          <TextInput
            placeholder="Search materials..."
            placeholderTextColor={color.textFaint}
            value={search}
            onChangeText={setSearch}
            style={styles.modalSearchInput}
            autoFocus={Platform.OS !== 'ios'}
            returnKeyType="search"
          />
        </View>

        {/* Category filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pickerCatRow}
        >
          <Pressable
            onPress={() => setCatFilter('all')}
            style={[styles.pickerCatChip, catFilter === 'all' && styles.pickerCatChipActive]}
          >
            <Text variant="caption" style={{ color: catFilter === 'all' ? color.onPrimary : color.textMuted }}>All</Text>
          </Pressable>
          {MATERIAL_CATEGORIES.map((cat) => {
            const active = catFilter === cat.key;
            return (
              <Pressable
                key={cat.key}
                onPress={() => setCatFilter(cat.key)}
                style={[styles.pickerCatChip, active && styles.pickerCatChipActive]}
              >
                <Ionicons name={cat.icon as any} size={14} color={active ? color.onPrimary : color.textMuted} />
                <Text variant="caption" style={{ color: active ? color.onPrimary : color.textMuted }}>{cat.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => {
            const catConfig = getCategoryConfig(item.category ?? 'other');
            return (
              <Pressable
                onPress={() => { onSelect(item); setSearch(''); setCatFilter('all'); }}
                style={({ pressed }) => [styles.libRow, pressed && { opacity: 0.7 }]}
              >
                <View style={[styles.libCatDot, { backgroundColor: catConfig.color }]} />
                <View style={styles.flex}>
                  <Text variant="rowTitle" color="text" numberOfLines={1}>{item.name}</Text>
                  <Text variant="caption" color="textMuted" numberOfLines={1}>
                    {[item.brand, item.variety, item.size].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={styles.libRight}>
                  <Text variant="caption" color="textMuted">{item.unit}</Text>
                  {item.defaultRate ? <Text variant="metaStrong" color="text">₹{item.defaultRate}</Text> : null}
                </View>
                <Ionicons name="add-circle-outline" size={20} color={color.primary} />
              </Pressable>
            );
          }}
          showsVerticalScrollIndicator={false}
          style={styles.modalList}
          ListEmptyComponent={
            <View style={styles.modalEmpty}>
              <Text variant="meta" color="textMuted">
                {loading ? 'Loading...' : search ? 'No matches' : 'Library is empty. Add items manually.'}
              </Text>
            </View>
          }
        />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Category-specific field chips ──

function FieldChips({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.fieldChipGrid}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(active ? '' : opt)}
            style={[styles.fieldChip, active && styles.fieldChipActive]}
          >
            <Text variant="caption" style={{ color: active ? color.onPrimary : color.text }}>
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Manual Item Modal ──

function ManualItemModal({
  visible,
  orgId,
  userId,
  onAdd,
  onClose,
}: {
  visible: boolean;
  orgId: string;
  userId: string;
  onAdd: (item: RequestLineItem) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<MaterialCategory | ''>('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [variety, setVariety] = useState('');
  const [make, setMake] = useState('');
  const [size, setSize] = useState('');
  const [unit, setUnit] = useState('');
  const [rate, setRate] = useState('');
  const [saving, setSaving] = useState(false);

  const catConfig = category ? getCategoryConfig(category) : null;

  function handleCategoryChange(cat: MaterialCategory) {
    setCategory(cat);
    const config = getCategoryConfig(cat);
    setUnit(config.defaultUnit);
    setBrand(''); setVariety(''); setMake(''); setSize('');
  }

  function setFieldValue(key: string, val: string) {
    switch (key) {
      case 'brand': setBrand(val); break;
      case 'variety': setVariety(val); break;
      case 'make': setMake(val); break;
      case 'size': setSize(val); break;
    }
  }

  function getFieldValue(key: string): string {
    switch (key) {
      case 'brand': return brand;
      case 'variety': return variety;
      case 'make': return make;
      case 'size': return size;
      default: return '';
    }
  }

  function resetForm() {
    setCategory(''); setName(''); setBrand(''); setVariety(''); setMake('');
    setSize(''); setUnit(''); setRate('');
  }

  async function handleAdd() {
    if (!name.trim() || !unit || !category) return;
    setSaving(true);
    try {
      const libId = await createLibraryItem({
        orgId,
        category,
        name: name.trim(),
        brand: brand.trim(),
        variety: variety.trim(),
        make: make.trim(),
        size: size.trim(),
        unit,
        defaultRate: rate ? parseFloat(rate) : undefined,
        createdBy: userId,
      });

      const item: RequestLineItem = {
        _key: `manual_${Date.now()}`,
        libraryItemId: libId,
        category,
        name: name.trim(),
        brand: brand.trim(),
        variety: variety.trim(),
        make: make.trim(),
        size: size.trim(),
        unit,
        quantity: 1,
        rate: rate ? parseFloat(rate) : 0,
        totalCost: rate ? parseFloat(rate) : 0,
        deliveryStatus: 'pending',
      };
      onAdd(item);
      resetForm();
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}><View /></Pressable>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalSheet}
      >
        <View style={styles.modalHandle} />
        <Text variant="bodyStrong" color="text" style={styles.modalTitle}>
          Add Material Manually
        </Text>
        <Text variant="caption" color="textMuted" style={{ textAlign: 'center', marginBottom: space.sm }}>
          This will also save to your library
        </Text>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.manualForm}
          keyboardDismissMode="on-drag"
        >
          {/* Category selector */}
          <Text variant="caption" color="textMuted" style={styles.manualLabel}>CATEGORY *</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.manualCatRow}
          >
            {MATERIAL_CATEGORIES.map((cat) => {
              const active = category === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => handleCategoryChange(cat.key)}
                  style={[styles.manualCatChip, active && { borderColor: cat.color, backgroundColor: cat.color + '15' }]}
                >
                  <Ionicons name={cat.icon as any} size={16} color={active ? cat.color : color.textMuted} />
                  <Text variant="caption" style={{ color: active ? cat.color : color.textMuted, fontWeight: active ? '600' : '400' }}>
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Name */}
          <TextField label="Name *" placeholder="e.g. Cement, Plywood" autoCapitalize="words" value={name} onChangeText={setName} containerStyle={{ marginTop: space.xs }} />

          {/* Category-specific fields */}
          {catConfig && catConfig.fields.map((field) => (
            <View key={field.key} style={{ marginTop: space.xs }}>
              <Text variant="caption" color="textMuted" style={styles.manualLabel}>
                {field.label.toUpperCase()}
              </Text>
              {field.type === 'chips' && field.options ? (
                <FieldChips
                  options={field.options}
                  value={getFieldValue(field.key)}
                  onChange={(v) => setFieldValue(field.key, v)}
                />
              ) : (
                <TextField
                  placeholder={field.placeholder}
                  autoCapitalize="words"
                  value={getFieldValue(field.key)}
                  onChangeText={(v) => setFieldValue(field.key, v)}
                />
              )}
            </View>
          ))}

          {/* Rate */}
          <View style={[styles.rowInputs, { marginTop: space.xs }]}>
            <View style={styles.flex}>
              <TextField label="Rate (₹)" placeholder="0" keyboardType="numeric" value={rate} onChangeText={(t) => setRate(t.replace(/[^\d.]/g, ''))} />
            </View>
            <View style={styles.flex} />
          </View>

          {/* Unit chips */}
          <Text variant="caption" color="textMuted" style={styles.manualLabel}>UNIT *</Text>
          <View style={styles.unitRow}>
            {UNITS.map((u) => {
              const active = unit === u;
              return (
                <Pressable key={u} onPress={() => setUnit(active ? '' : u)} style={[styles.unitChip, active && styles.unitChipActive]}>
                  <Text variant="caption" style={{ color: active ? color.onPrimary : color.text }}>{u}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.manualFooter}>
          <Button
            label="Add Item"
            onPress={handleAdd}
            loading={saving}
            disabled={!name.trim() || !unit || !category}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingBottom: space.xs,
    backgroundColor: color.bgGrouped,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center' },
  scroll: { paddingHorizontal: screenInset, paddingTop: space.md, paddingBottom: space.xxl },
  sectionLabel: { marginTop: space.md, marginBottom: space.xs },
  approverSection: { marginBottom: space.sm },
  approverHint: { marginBottom: space.sm, lineHeight: 20 },
  approverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    marginBottom: space.xs,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
  },
  approverRowOn: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },

  addRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bgGrouped,
  },

  rejectionBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    backgroundColor: color.dangerSoft,
    borderWidth: 1,
    borderColor: color.danger,
    borderRadius: 10,
    padding: space.sm,
    marginBottom: space.sm,
  },

  summaryCard: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    marginBottom: space.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.borderStrong,
    marginVertical: 8,
  },

  emptyItems: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },

  itemCard: {
    backgroundColor: color.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.borderStrong,
    padding: space.sm,
    marginBottom: space.sm,
  },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, marginBottom: space.xs },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  itemInputs: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  inputGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  numInput: { width: 60, fontSize: 14, fontWeight: '600', color: color.text, borderBottomWidth: 1, borderBottomColor: color.primary, paddingVertical: 2, textAlign: 'center' },
  totalGroup: { marginLeft: 'auto', alignItems: 'flex-end' },

  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    marginTop: space.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    borderRadius: 8,
  },

  footer: { paddingHorizontal: screenInset, paddingVertical: space.sm, backgroundColor: color.bgGrouped, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderStrong },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: { backgroundColor: color.bgGrouped, borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingTop: space.sm, maxHeight: '80%', borderTopWidth: 1, borderTopColor: color.borderStrong },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: color.border, alignSelf: 'center', marginBottom: space.sm },
  modalTitle: { textAlign: 'center', marginBottom: space.sm },
  modalSearch: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginHorizontal: screenInset, marginBottom: space.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.sm, backgroundColor: color.bgGrouped, borderWidth: 1, borderColor: color.border },
  modalSearchInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: color.text,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  modalList: { paddingHorizontal: screenInset, maxHeight: 400 },
  modalEmpty: { paddingVertical: space.xl, alignItems: 'center' },

  pickerCatRow: { gap: space.xs, paddingHorizontal: screenInset, paddingBottom: space.sm },
  pickerCatChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: color.borderStrong, backgroundColor: color.surface },
  pickerCatChipActive: { backgroundColor: color.primary, borderColor: color.primary },

  libRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.separator },
  libCatDot: { width: 8, height: 8, borderRadius: 4 },
  libRight: { alignItems: 'flex-end', gap: 2 },

  // Field chips (category-specific)
  fieldChipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  fieldChip: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface },
  fieldChipActive: { backgroundColor: color.primary, borderColor: color.primary },

  // Manual form
  manualForm: { paddingHorizontal: screenInset, paddingBottom: space.md },
  manualFooter: { paddingHorizontal: screenInset, paddingVertical: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.separator },
  manualLabel: { marginTop: space.sm, marginBottom: space.xs },
  manualCatRow: { gap: space.xs },
  manualCatChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface },
  rowInputs: { flexDirection: 'row', gap: space.sm },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  unitChip: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border },
  unitChipActive: { backgroundColor: color.primary, borderColor: color.primary },
});
