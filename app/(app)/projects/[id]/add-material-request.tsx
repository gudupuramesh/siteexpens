/**
 * Create / Edit Material Request — v2 design.
 *
 * Layout (top → bottom):
 *   1. SheetHeader: Cancel · "New material request" / "Edit & re-submit" · Save
 *   2. Rejection banner (only when ?resubmit=1)
 *   3. Summary tile — items count + total value
 *   4. FormGroup "Request" — title input
 *   5. FormGroup "Notify approvers" (when not auto-approving) — checkbox rows
 *   6. ITEMS section — From library / Add manually buttons + cards per item
 *   7. Empty state (when no items)
 *
 * Pickers:
 *   • LibraryPickerSheet — bottom sheet with search + category chips + list
 *   • ManualItemSheet    — bottom sheet to create a new library item + add it
 *
 * Preserves all existing Firestore writes (createMaterialRequest /
 * updateMaterialRequest / resubmitRejectedRequest), capability gating
 * (`material.request.write`), and the resubmit flow (`?reqId=&resubmit=1`).
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGuardedRoute } from '@/src/features/org/useGuardedRoute';
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
import type {
  MaterialLibraryItem,
  MaterialCategory,
} from '@/src/features/materialLibrary/types';
import {
  MATERIAL_CATEGORIES,
  getCategoryConfig,
} from '@/src/features/materialLibrary/types';
import type { MaterialRequestItem } from '@/src/features/materialRequests/types';
import { useMaterialRequest } from '@/src/features/materialRequests/useMaterialRequest';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { SubmitProgressOverlay } from '@/src/ui/SubmitProgressOverlay';
import { inrCompact, useThemeV2 } from '@/src/theme/v2';

const UNITS = [
  'pcs', 'kg', 'bags', 'sqft', 'rft', 'cft', 'litres', 'meters', 'tons', 'sets',
];

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
  const t = useThemeV2();
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
        router.replace(
          `/(app)/projects/${projectId}/material-request/${newId}` as never,
        );
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

  const screenTitle = isResubmitting
    ? 'Edit & re-submit'
    : isEditMode
      ? 'Edit request'
      : 'New material request';

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  const canSubmit = items.length > 0 && !!orgId && !(isEditMode && requestLoading);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title={screenTitle}
        cancelLabel="Cancel"
        saveLabel={
          isEditMode
            ? 'Update'
            : needsMaterialApproval
              ? 'Submit'
              : 'Save'
        }
        saveLoading={submitting}
        saveDisabled={!canSubmit}
        onCancel={() => router.back()}
        onSave={() => void onSubmit()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Rejection banner */}
          {isResubmitting && existingRequest?.rejectionNote ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              <View
                style={[
                  styles.rejectionCard,
                  {
                    backgroundColor:
                      t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                    borderRadius: t.radii.card,
                    borderColor: t.palette.red.base + '33',
                    borderWidth: t.hairline,
                  },
                ]}
              >
                <View style={styles.rejectionHeader}>
                  <View
                    style={[
                      styles.rejectionDot,
                      { backgroundColor: t.palette.red.base },
                    ]}
                  />
                  <Text
                    variant="caption2"
                    style={{
                      color: t.palette.red.base,
                      letterSpacing: 0.5,
                      fontWeight: '700',
                    }}
                  >
                    PREVIOUSLY REJECTED
                  </Text>
                </View>
                <Text variant="callout" color="label" style={{ marginTop: 6 }}>
                  {existingRequest.rejectionNote}
                </Text>
                <Text
                  variant="caption1"
                  color="secondary"
                  style={{ marginTop: 6 }}
                >
                  Address the feedback above and submit again — approvers will
                  be notified.
                </Text>
              </View>
            </View>
          ) : null}

          {/* Summary tile */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <View
              style={[
                styles.summaryCard,
                {
                  backgroundColor: cardBg,
                  borderRadius: t.radii.card,
                  borderColor: cardBorder,
                  borderWidth: t.hairline,
                },
              ]}
            >
              <View style={styles.summaryCol}>
                <Text
                  variant="caption2"
                  color="tertiary"
                  style={{ letterSpacing: 0.5 }}
                >
                  ITEMS
                </Text>
                <Text variant="title3" color="label" style={{ marginTop: 4, fontWeight: '700' }}>
                  {items.length}
                </Text>
              </View>
              <View
                style={[
                  styles.summaryDivider,
                  { backgroundColor: t.colors.separator },
                ]}
              />
              <View style={[styles.summaryCol, { alignItems: 'flex-end' }]}>
                <Text
                  variant="caption2"
                  color="tertiary"
                  style={{ letterSpacing: 0.5 }}
                >
                  TOTAL VALUE
                </Text>
                <Text
                  variant="title3"
                  style={{
                    color: t.palette.blue.base,
                    marginTop: 4,
                    fontWeight: '700',
                  }}
                >
                  {inrCompact(totalValue)}
                </Text>
              </View>
            </View>
          </View>

          {/* Title */}
          <FormGroup header="Request">
            <InputRow
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Week 12 Cement Order"
              autoCapitalize="words"
              divider={false}
            />
          </FormGroup>

          {/* Approvers */}
          {!isEditMode && needsMaterialApproval && materialApproverChoices.length > 0 ? (
            <FormGroup
              header="Notify approvers"
              footer="Any Manager, Admin, or Super Admin can approve. Selected members get a heads-up in their notifications."
            >
              {materialApproverChoices.map((m, idx) => {
                const on = designatedApproverUids.includes(m.uid);
                const last = idx === materialApproverChoices.length - 1;
                return (
                  <Pressable
                    key={m.uid}
                    onPress={() =>
                      setDesignatedApproverUids((prev) =>
                        prev.includes(m.uid)
                          ? prev.filter((u) => u !== m.uid)
                          : [...prev, m.uid],
                      )
                    }
                    style={({ pressed }) => [
                      styles.approverRow,
                      pressed && { backgroundColor: t.colors.fill3 },
                    ]}
                  >
                    <Ionicons
                      name={on ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={on ? t.palette.blue.base : t.colors.tertiary}
                      style={{ marginRight: 10 }}
                    />
                    <Text
                      variant="callout"
                      color="label"
                      style={{ flex: 1 }}
                      numberOfLines={1}
                    >
                      {m.displayName}
                    </Text>
                    {!last ? (
                      <View
                        style={[
                          styles.rowDivider,
                          { backgroundColor: t.colors.separator, left: 48 },
                        ]}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </FormGroup>
          ) : null}

          {/* ITEMS section */}
          <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
            <Text
              variant="caption2"
              color="secondary"
              style={{
                paddingHorizontal: 16,
                letterSpacing: 0.4,
                paddingBottom: 8,
              }}
            >
              ITEMS
            </Text>
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => setShowLibrary(true)}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    backgroundColor:
                      t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                    borderRadius: t.radii.field,
                    borderColor: t.palette.blue.base + '33',
                    borderWidth: t.hairline,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="library-outline" size={16} color={t.palette.blue.base} />
                <Text
                  variant="footnote"
                  style={{
                    color: t.palette.blue.base,
                    fontWeight: '700',
                    marginLeft: 6,
                  }}
                >
                  From library
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowManual(true)}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    backgroundColor: cardBg,
                    borderRadius: t.radii.field,
                    borderColor: cardBorder,
                    borderWidth: t.hairline,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="create-outline" size={16} color={t.colors.label} />
                <Text
                  variant="footnote"
                  color="label"
                  style={{ fontWeight: '700', marginLeft: 6 }}
                >
                  Add manually
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Items list */}
          {items.length === 0 ? (
            <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: cardBg,
                    borderRadius: t.radii.card,
                    borderColor: cardBorder,
                    borderWidth: t.hairline,
                  },
                ]}
              >
                <Ionicons
                  name="cube-outline"
                  size={28}
                  color={t.colors.tertiary}
                />
                <Text
                  variant="callout"
                  color="secondary"
                  style={{ marginTop: 8, textAlign: 'center' }}
                >
                  No items added
                </Text>
                <Text
                  variant="caption1"
                  color="tertiary"
                  style={{ marginTop: 4, textAlign: 'center' }}
                >
                  Pick from library or add a custom item
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 16, marginTop: 12, gap: 10 }}>
              {items.map((item) => {
                const catConfig = item.category
                  ? getCategoryConfig(item.category as MaterialCategory)
                  : null;
                const meta = [item.brand, item.variety, item.size]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <View
                    key={item._key}
                    style={[
                      styles.itemCard,
                      {
                        backgroundColor: cardBg,
                        borderRadius: t.radii.card,
                        borderColor: cardBorder,
                        borderWidth: t.hairline,
                      },
                    ]}
                  >
                    {/* Header */}
                    <View style={styles.itemHead}>
                      <View style={styles.itemTitleRow}>
                        {catConfig ? (
                          <View
                            style={[
                              styles.catDot,
                              { backgroundColor: t.colors.tertiary },
                            ]}
                          />
                        ) : null}
                        <Text
                          variant="headline"
                          color="label"
                          style={{ flex: 1, fontWeight: '700' }}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                      </View>
                      <Pressable onPress={() => removeItem(item._key)} hitSlop={10}>
                        <Ionicons
                          name="close-circle"
                          size={20}
                          color={t.palette.red.base}
                        />
                      </Pressable>
                    </View>
                    {meta ? (
                      <Text
                        variant="caption1"
                        color="secondary"
                        style={{ marginTop: 2, marginLeft: catConfig ? 14 : 0 }}
                        numberOfLines={1}
                      >
                        {meta}
                      </Text>
                    ) : null}

                    {/* Inputs */}
                    <View
                      style={[
                        styles.itemInputs,
                        { borderTopColor: t.colors.separator, borderTopWidth: t.hairline },
                      ]}
                    >
                      <View style={styles.inputCol}>
                        <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.4 }}>
                          QTY
                        </Text>
                        <View style={styles.qtyRow}>
                          <TextInput
                            style={[
                              styles.numInput,
                              {
                                color: t.colors.label,
                                ...t.type.headline,
                                fontWeight: '600',
                              },
                            ]}
                            keyboardType="numeric"
                            value={item.quantity > 0 ? String(item.quantity) : ''}
                            onChangeText={(v) => updateItem(item._key, 'quantity', v)}
                            placeholder="0"
                            placeholderTextColor={t.colors.tertiary}
                          />
                          <Text variant="caption1" color="tertiary" style={{ marginLeft: 4 }}>
                            {item.unit}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={[
                          styles.inputDivider,
                          { backgroundColor: t.colors.separator },
                        ]}
                      />

                      <View style={styles.inputCol}>
                        <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.4 }}>
                          ₹ RATE
                        </Text>
                        <TextInput
                          style={[
                            styles.numInput,
                            {
                              color: t.colors.label,
                              ...t.type.headline,
                              fontWeight: '600',
                            },
                          ]}
                          keyboardType="numeric"
                          value={item.rate > 0 ? String(item.rate) : ''}
                          onChangeText={(v) => updateItem(item._key, 'rate', v)}
                          placeholder="0"
                          placeholderTextColor={t.colors.tertiary}
                        />
                      </View>

                      <View
                        style={[
                          styles.inputDivider,
                          { backgroundColor: t.colors.separator },
                        ]}
                      />

                      <View style={[styles.inputCol, { alignItems: 'flex-end' }]}>
                        <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.4 }}>
                          TOTAL
                        </Text>
                        <Text
                          variant="headline"
                          style={{
                            color: t.palette.blue.base,
                            marginTop: 4,
                            fontWeight: '700',
                          }}
                        >
                          {inrCompact(item.totalCost)}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Library Picker */}
      <LibraryPickerSheet
        visible={showLibrary}
        orgId={orgId}
        onSelect={addFromLibrary}
        onClose={() => setShowLibrary(false)}
      />

      {/* Manual Item */}
      <ManualItemSheet
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
    </View>
  );
}

// ── Library Picker Sheet ──

function LibraryPickerSheet({
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
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<CategoryFilter>('all');
  const activeCat = catFilter === 'all' ? undefined : catFilter;
  const { data: items, loading } = useMaterialLibrary(orgId, search, activeCat);

  const close = () => {
    Keyboard.dismiss();
    setSearch('');
    setCatFilter('all');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View
          style={[
            sheetStyles.sheet,
            {
              backgroundColor: t.colors.surface,
              borderTopLeftRadius: t.radii.sheet,
              borderTopRightRadius: t.radii.sheet,
              paddingBottom: insets.bottom + 8,
              maxHeight: '85%',
            },
          ]}
        >
          <View
            style={[sheetStyles.grabber, { backgroundColor: t.colors.tertiary }]}
          />
          <View
            style={[
              sheetStyles.header,
              {
                borderBottomColor: t.colors.separator,
                borderBottomWidth: t.hairline,
              },
            ]}
          >
            <Pressable onPress={close} hitSlop={8} style={sheetStyles.sideBtn}>
              <Text variant="body" style={{ color: t.palette.blue.base }}>
                Cancel
              </Text>
            </Pressable>
            <Text
              variant="headline"
              color="label"
              style={[sheetStyles.title, { fontWeight: '600' }]}
            >
              Material library
            </Text>
            <View style={sheetStyles.sideBtn} />
          </View>

          {/* Search */}
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <View
              style={[
                sheetStyles.searchBar,
                { backgroundColor: t.colors.fill3, borderRadius: t.radii.field },
              ]}
            >
              <Ionicons name="search" size={16} color={t.colors.tertiary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search materials…"
                placeholderTextColor={t.colors.tertiary}
                style={[
                  sheetStyles.searchInput,
                  { color: t.colors.label, ...t.type.callout },
                ]}
                returnKeyType="search"
              />
              {search ? (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={t.colors.tertiary} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Category chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 6 }}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable
              onPress={() => setCatFilter('all')}
              style={({ pressed }) => [
                sheetStyles.chip,
                {
                  backgroundColor:
                    catFilter === 'all'
                      ? t.mode === 'dark'
                        ? t.palette.blue.softDark
                        : t.palette.blue.soft
                      : t.colors.fill3,
                  borderRadius: 999,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                variant="caption1"
                style={{
                  color:
                    catFilter === 'all' ? t.palette.blue.base : t.colors.secondary,
                  fontWeight: catFilter === 'all' ? '700' : '500',
                }}
              >
                All
              </Text>
            </Pressable>
            {MATERIAL_CATEGORIES.map((cat) => {
              const active = catFilter === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => setCatFilter(cat.key)}
                  style={({ pressed }) => [
                    sheetStyles.chip,
                    {
                      backgroundColor: active
                        ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
                        : t.colors.fill3,
                      borderRadius: 999,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Ionicons
                    name={cat.icon as keyof typeof Ionicons.glyphMap}
                    size={12}
                    color={active ? t.palette.blue.base : t.colors.tertiary}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    variant="caption1"
                    style={{
                      color: active ? t.palette.blue.base : t.colors.secondary,
                      fontWeight: active ? '700' : '500',
                    }}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* List */}
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingBottom: 12 }}
            renderItem={({ item }) => {
              const catConfig = getCategoryConfig(item.category ?? 'other');
              const meta = [item.brand, item.variety, item.size]
                .filter(Boolean)
                .join(' · ');
              return (
                <Pressable
                  onPress={() => onSelect(item)}
                  style={({ pressed }) => [
                    sheetStyles.libRow,
                    pressed && { backgroundColor: t.colors.fill3 },
                  ]}
                >
                  <View
                    style={[
                      sheetStyles.libIcon,
                      { backgroundColor: t.colors.fill3 },
                    ]}
                  >
                    <Ionicons
                      name={catConfig.icon as keyof typeof Ionicons.glyphMap}
                      size={14}
                      color={t.colors.secondary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="body" color="label" numberOfLines={1}>
                      {item.name}
                    </Text>
                    {meta ? (
                      <Text
                        variant="caption1"
                        color="secondary"
                        numberOfLines={1}
                        style={{ marginTop: 1 }}
                      >
                        {meta}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', marginRight: 6 }}>
                    {item.defaultRate ? (
                      <Text variant="footnote" color="label">
                        ₹{item.defaultRate}
                      </Text>
                    ) : null}
                    <Text variant="caption2" color="tertiary">
                      {item.unit}
                    </Text>
                  </View>
                  <Ionicons
                    name="add-circle"
                    size={22}
                    color={t.palette.blue.base}
                  />
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                <Text variant="callout" color="secondary">
                  {loading ? 'Loading…' : search ? 'No matches' : 'Library is empty'}
                </Text>
                {!loading && !search ? (
                  <Text
                    variant="caption1"
                    color="tertiary"
                    style={{ marginTop: 4 }}
                  >
                    Add items manually to build your library
                  </Text>
                ) : null}
              </View>
            }
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Manual Item Sheet ──

function ManualItemSheet({
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
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
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
    setBrand('');
    setVariety('');
    setMake('');
    setSize('');
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
    setCategory('');
    setName('');
    setBrand('');
    setVariety('');
    setMake('');
    setSize('');
    setUnit('');
    setRate('');
  }

  const close = () => {
    Keyboard.dismiss();
    resetForm();
    onClose();
  };

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

  const canAdd = !!name.trim() && !!unit && !!category;
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View
          style={[
            sheetStyles.sheet,
            {
              backgroundColor: t.colors.surface,
              borderTopLeftRadius: t.radii.sheet,
              borderTopRightRadius: t.radii.sheet,
              paddingBottom: insets.bottom + 8,
              maxHeight: '92%',
            },
          ]}
        >
          <View
            style={[sheetStyles.grabber, { backgroundColor: t.colors.tertiary }]}
          />
          <View
            style={[
              sheetStyles.header,
              {
                borderBottomColor: t.colors.separator,
                borderBottomWidth: t.hairline,
              },
            ]}
          >
            <Pressable onPress={close} hitSlop={8} style={sheetStyles.sideBtn}>
              <Text variant="body" style={{ color: t.palette.blue.base }}>
                Cancel
              </Text>
            </Pressable>
            <Text
              variant="headline"
              color="label"
              style={[sheetStyles.title, { fontWeight: '600' }]}
            >
              Add manually
            </Text>
            <Pressable
              onPress={() => void handleAdd()}
              disabled={!canAdd || saving}
              hitSlop={8}
              style={({ pressed }) => [
                sheetStyles.sideBtn,
                { alignItems: 'flex-end' },
                (!canAdd || saving || pressed) && { opacity: 0.5 },
              ]}
            >
              <Text
                variant="body"
                style={{
                  color: !canAdd ? t.colors.tertiary : t.palette.blue.base,
                  fontWeight: '600',
                }}
              >
                {saving ? 'Adding…' : 'Add'}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            <Text
              variant="caption1"
              color="tertiary"
              style={{ textAlign: 'center', paddingTop: 10 }}
            >
              Saves to your library too
            </Text>

            {/* Category chips */}
            <Text
              variant="caption2"
              color="secondary"
              style={{
                paddingHorizontal: 32,
                paddingTop: 16,
                paddingBottom: 8,
                letterSpacing: 0.4,
              }}
            >
              CATEGORY
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
              keyboardShouldPersistTaps="handled"
            >
              {MATERIAL_CATEGORIES.map((cat) => {
                const active = category === cat.key;
                return (
                  <Pressable
                    key={cat.key}
                    onPress={() => handleCategoryChange(cat.key)}
                    style={({ pressed }) => [
                      sheetStyles.chip,
                      {
                        backgroundColor: active
                          ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
                          : t.colors.fill3,
                        borderRadius: 999,
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Ionicons
                      name={cat.icon as keyof typeof Ionicons.glyphMap}
                      size={12}
                      color={active ? t.palette.blue.base : t.colors.tertiary}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      variant="caption1"
                      style={{
                        color: active ? t.palette.blue.base : t.colors.secondary,
                        fontWeight: active ? '700' : '500',
                      }}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Material card */}
            <FormGroup header="Material">
              <InputRow
                label="Name"
                value={name}
                onChangeText={setName}
                placeholder="e.g. Cement, Plywood"
                autoCapitalize="words"
                divider={!!catConfig && catConfig.fields.length > 0}
              />
              {catConfig
                ? catConfig.fields.map((field, idx) => {
                    const last = idx === catConfig.fields.length - 1;
                    if (field.type === 'chips' && field.options) {
                      return (
                        <View
                          key={field.key}
                          style={{ paddingHorizontal: 16, paddingVertical: 12, position: 'relative' }}
                        >
                          <Text
                            variant="caption2"
                            color="tertiary"
                            style={{ letterSpacing: 0.5 }}
                          >
                            {field.label.toUpperCase()}
                          </Text>
                          <View style={sheetStyles.chipGrid}>
                            {field.options.map((opt) => {
                              const active = getFieldValue(field.key) === opt;
                              return (
                                <Pressable
                                  key={opt}
                                  onPress={() =>
                                    setFieldValue(field.key, active ? '' : opt)
                                  }
                                  style={({ pressed }) => [
                                    sheetStyles.fieldChip,
                                    {
                                      backgroundColor: active
                                        ? t.mode === 'dark'
                                          ? t.palette.blue.softDark
                                          : t.palette.blue.soft
                                        : t.colors.fill3,
                                      borderRadius: 999,
                                    },
                                    pressed && { opacity: 0.85 },
                                  ]}
                                >
                                  <Text
                                    variant="caption1"
                                    style={{
                                      color: active
                                        ? t.palette.blue.base
                                        : t.colors.label,
                                      fontWeight: active ? '700' : '500',
                                    }}
                                  >
                                    {opt}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                          {!last ? (
                            <View
                              style={[
                                styles.rowDivider,
                                { backgroundColor: t.colors.separator, left: 16 },
                              ]}
                            />
                          ) : null}
                        </View>
                      );
                    }
                    return (
                      <InputRow
                        key={field.key}
                        label={field.label}
                        value={getFieldValue(field.key)}
                        onChangeText={(v) => setFieldValue(field.key, v)}
                        placeholder={field.placeholder}
                        autoCapitalize="words"
                        divider={!last}
                      />
                    );
                  })
                : null}
            </FormGroup>

            {/* Pricing */}
            <FormGroup header="Pricing">
              <InputRow
                label="Default rate"
                value={rate}
                onChangeText={(v) => setRate(v.replace(/[^\d.]/g, ''))}
                placeholder="0"
                keyboardType="numeric"
                divider
              />
              <View
                style={{ paddingHorizontal: 16, paddingVertical: 12, position: 'relative' }}
              >
                <Text
                  variant="caption2"
                  color="tertiary"
                  style={{ letterSpacing: 0.5 }}
                >
                  UNIT
                </Text>
                <View style={sheetStyles.chipGrid}>
                  {UNITS.map((u) => {
                    const active = unit === u;
                    return (
                      <Pressable
                        key={u}
                        onPress={() => setUnit(active ? '' : u)}
                        style={({ pressed }) => [
                          sheetStyles.fieldChip,
                          {
                            backgroundColor: active
                              ? t.mode === 'dark'
                                ? t.palette.blue.softDark
                                : t.palette.blue.soft
                              : t.colors.fill3,
                            borderRadius: 999,
                          },
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <Text
                          variant="caption1"
                          style={{
                            color: active ? t.palette.blue.base : t.colors.label,
                            fontWeight: active ? '700' : '500',
                          }}
                        >
                          {u}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </FormGroup>

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },

  // Rejection banner
  rejectionCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rejectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rejectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Summary tile
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  summaryCol: {
    flex: 1,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 14,
  },

  // Approver row
  approverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
    position: 'relative',
  },
  rowDivider: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    height: 0.5,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },

  // Empty card
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },

  // Item card
  itemCard: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 0,
  },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  itemTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  catDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  itemInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 12,
  },
  inputCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  inputDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 8,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  numInput: {
    paddingVertical: 0,
    margin: 0,
    minWidth: 50,
    marginTop: 4,
  },
});

const sheetStyles = StyleSheet.create({
  sheet: { paddingTop: 8 },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sideBtn: { minWidth: 70 },
  title: { flex: 1, textAlign: 'center' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, paddingVertical: 0, margin: 0 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  libRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  libIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  fieldChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
