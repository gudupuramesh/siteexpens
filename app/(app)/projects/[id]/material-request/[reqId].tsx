/**
 * Material Request detail / preview — v2 design.
 *
 * Layout:
 *   1. Header — back · "Material request" · edit/delete (when creator)
 *   2. Hero card — title · status pill · created date
 *   3. Progress sliver (when approved)
 *   4. KPI strip — Items · Received · Total value
 *   5. Audit FormGroup — Requested by · Approved by · Designated · Edited
 *   6. Items list (compact rows with category dot, name, qty/unit/price,
 *      delivery chip when approved)
 *   7. Action footer — Reject/Approve · Edit-before-approve · Edit-resubmit ·
 *      Share to shop
 *   8. Reject sheet · Delivery picker sheet
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { useOrgMembers } from '@/src/features/org/useOrgMembers';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useProject } from '@/src/features/projects/useProject';
import { getCategoryConfig, type MaterialCategory } from '@/src/features/materialLibrary/types';
import { useMaterialRequest } from '@/src/features/materialRequests/useMaterialRequest';
import {
  approveRequest,
  rejectRequest,
  updateItemDeliveryStatus,
  deleteMaterialRequest,
} from '@/src/features/materialRequests/materialRequests';
import { generateShopSharePdf } from '@/src/features/materialRequests/materialRequestReport';
import {
  DELIVERY_STATUSES,
  type MaterialRequestItem,
  type DeliveryStatus,
} from '@/src/features/materialRequests/types';
import { formatInr } from '@/src/lib/format';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { Row } from '@/src/ui/v2/Row';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

function compactDateTime(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return '—';
  const dt = ts.toDate();
  return `${dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} ${dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function MaterialRequestDetailScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; reqId: string }>();
  const projectId = params.id;
  const reqId = params.reqId;

  const { user } = useAuth();
  const { can } = usePermissions();
  const { data: project } = useProject(projectId);
  const { members } = useOrgMembers(project?.orgId);
  const { data: request, loading } = useMaterialRequest(reqId);

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeliveryPicker, setShowDeliveryPicker] = useState<number | null>(null);

  const canApproveMat = can('material.request.approve');
  const isPending = request?.status === 'pending';
  const isApproved = request?.status === 'approved';
  const isRejected = request?.status === 'rejected';
  const isCreator = !!user?.uid && !!request && request.createdBy === user.uid;
  const membersByUid = new Map(members.map((m) => [m.uid, m]));
  const getMemberLabel = (uid?: string): string => {
    if (!uid) return 'Unknown';
    return membersByUid.get(uid)?.displayName ?? 'Team';
  };
  const canShowPrices =
    !!user?.uid && request ? canApproveMat || request.createdBy === user.uid : false;
  const showPendingNavActions =
    !!user?.uid && !!request && isPending && isCreator && can('material.request.write');
  const showApproverEditCta = !!request && isPending && canApproveMat && !isCreator;
  const showResubmitCta = !!request && isRejected && isCreator;

  const receivedCount = request?.items.filter((i) => i.deliveryStatus === 'received_at_site').length ?? 0;
  const totalItems = request?.items.length ?? 0;

  const handleApprove = useCallback(async () => {
    if (!reqId || !user) return;
    Alert.alert('Approve request', 'Approve this material request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          setActionLoading(true);
          try {
            await approveRequest(reqId, user.uid);
          } catch (err) {
            Alert.alert('Error', (err as Error).message);
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  }, [reqId, user]);

  const handleReject = useCallback(async () => {
    if (!reqId || !user) return;
    setActionLoading(true);
    try {
      await rejectRequest(reqId, user.uid, rejectNote.trim() || 'Rejected');
      setShowRejectModal(false);
      setRejectNote('');
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }, [reqId, rejectNote, user]);

  const handleDeliveryUpdate = useCallback(
    async (idx: number, status: DeliveryStatus) => {
      if (!reqId || !user) return;
      try {
        await updateItemDeliveryStatus(reqId, idx, status, user.uid);
      } catch (err) {
        Alert.alert('Error', (err as Error).message);
      }
      setShowDeliveryPicker(null);
    },
    [reqId, user],
  );

  const handleShare = useCallback(async () => {
    if (!request || !project) return;
    setActionLoading(true);
    try {
      await generateShopSharePdf(request, project);
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }, [request, project]);

  const handleDelete = useCallback(() => {
    Alert.alert('Delete request', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMaterialRequest(reqId);
            router.back();
          } catch (err) {
            Alert.alert('Error', (err as Error).message);
          }
        },
      },
    ]);
  }, [reqId]);

  const handleEdit = useCallback(() => {
    if (!projectId || !reqId || !isPending) return;
    router.push({
      pathname: '/(app)/projects/[id]/add-material-request',
      params: { id: projectId, reqId },
    });
  }, [isPending, projectId, reqId]);

  const handleResubmit = useCallback(() => {
    if (!projectId || !reqId || !isRejected) return;
    router.push({
      pathname: '/(app)/projects/[id]/add-material-request',
      params: { id: projectId, reqId, resubmit: '1' },
    });
  }, [isRejected, projectId, reqId]);

  if (loading || !request) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <Header onBack={() => router.back()} title="Material request" />
        <View style={styles.center}>
          <ActivityIndicator color={t.palette.blue.base} />
        </View>
      </View>
    );
  }

  // 90/10 discipline: only states that demand action carry colour.
  // approved / draft both go neutral; pending stays orange (action awaits)
  // and rejected stays red (problem the user must address).
  const statusTone =
    request.status === 'rejected'
      ? { fg: t.palette.red.base, bg: t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft, label: 'REJECTED' }
      : request.status === 'pending'
        ? { fg: t.palette.orange.base, bg: t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft, label: 'PENDING' }
        : { fg: t.colors.secondary, bg: t.colors.fill3, label: request.status === 'approved' ? 'APPROVED' : 'DRAFT' };

  const dateStr = request.createdAt
    ? request.createdAt.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  const designatedNames =
    isPending && request.designatedApproverUids && request.designatedApproverUids.length > 0
      ? request.designatedApproverUids.map((uid) => getMemberLabel(uid)).join(', ')
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <Header
        onBack={() => router.back()}
        title="Material request"
        right={
          showPendingNavActions ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <CircleBtn
                icon="create-outline"
                onPress={handleEdit}
                tint={t.palette.blue.base}
              />
              <CircleBtn
                icon="trash-outline"
                onPress={handleDelete}
                tint={t.palette.red.base}
              />
            </View>
          ) : undefined
        }
      />

      <FlatList
        data={request.items}
        keyExtractor={(_, idx) => String(idx)}
        renderItem={({ item, index }) => (
          <ItemRow
            item={item}
            index={index}
            showPrice={canShowPrices}
            showDelivery={isApproved}
            onDeliveryPress={() => setShowDeliveryPicker(index)}
          />
        )}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingBottom: insets.bottom + 140,
          },
        ]}
        ListHeaderComponent={
          <View>
            {/* Hero card */}
            <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
              <View
                style={[
                  styles.heroCard,
                  {
                    backgroundColor: cardBg,
                    borderRadius: t.radii.hero,
                    borderColor: cardBorder,
                    borderWidth: t.hairline,
                  },
                ]}
              >
                <View style={styles.heroTop}>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: statusTone.bg, borderRadius: 999 },
                    ]}
                  >
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: statusTone.fg,
                        marginRight: 5,
                      }}
                    />
                    <Text
                      variant="caption2"
                      style={{
                        color: statusTone.fg,
                        fontWeight: '700',
                        letterSpacing: 0.4,
                      }}
                    >
                      {statusTone.label}
                    </Text>
                  </View>
                  <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.4 }}>
                    {dateStr.toUpperCase()}
                  </Text>
                </View>
                <Text
                  variant="title3"
                  color="label"
                  style={{ marginTop: 8, fontWeight: '700' }}
                >
                  {request.title || 'Material request'}
                </Text>

                {/* Progress (when approved) */}
                {isApproved && totalItems > 0 ? (
                  <View style={styles.progressBlock}>
                    <View
                      style={[
                        styles.progressTrack,
                        { backgroundColor: t.colors.fill3 },
                      ]}
                    >
                      <View
                        style={[
                          styles.progressFill,
                          {
                            // Progress bar fill — interactive blue (active state)
                            // per the 90/10 rule.
                            width: `${(receivedCount / totalItems) * 100}%`,
                            backgroundColor: t.palette.blue.base,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      variant="caption2"
                      color="secondary"
                      style={{ marginTop: 4, letterSpacing: 0.4 }}
                    >
                      {receivedCount}/{totalItems} RECEIVED AT SITE
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* KPI strip — neutral counts per the 90/10 discipline. The
                labels carry the meaning; numbers don't need colour. */}
            <View style={styles.kpiRow}>
              <Kpi label="ITEMS" value={String(totalItems)} />
              <Kpi label="RECEIVED" value={`${receivedCount}/${totalItems}`} />
              <Kpi
                label="VALUE"
                value={canShowPrices ? formatInr(request.totalValue) : '—'}
              />
            </View>

            {/* Audit */}
            <FormGroup header="Audit">
              <Row
                label="Requested by"
                value={`${getMemberLabel(request.createdBy)} · ${compactDateTime(request.createdAt)}`}
              />
              {request.status === 'approved' ? (
                <Row
                  label="Approved by"
                  value={`${getMemberLabel(request.approvedBy)} · ${compactDateTime(request.approvedAt)}${
                    request.autoApproved ? ' · Auto' : ''
                  }`}
                />
              ) : null}
              {designatedNames ? (
                <Row label="Heads-up" value={designatedNames} />
              ) : null}
              {request.editedAt ? (
                <Row
                  label="Edited"
                  value={`${getMemberLabel(request.editedBy)} · ${compactDateTime(request.editedAt)}`}
                  divider={false}
                />
              ) : (
                <Row
                  label=""
                  value=""
                  divider={false}
                />
              )}
            </FormGroup>

            {/* Rejection note */}
            {isRejected && request.rejectionNote ? (
              <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
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
                  <Ionicons name="close-circle" size={14} color={t.palette.red.base} />
                  <Text
                    variant="caption1"
                    style={{
                      color: t.palette.red.base,
                      flex: 1,
                      marginLeft: 6,
                      fontWeight: '600',
                    }}
                  >
                    {request.rejectionNote}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={{ paddingHorizontal: 16, marginTop: 18, marginBottom: 8 }}>
              <Text
                variant="caption2"
                color="secondary"
                style={{ letterSpacing: 0.5 }}
              >
                ITEMS · {totalItems}
              </Text>
            </View>
          </View>
        }
      />

      {/* Action footer */}
      {(isPending && canApproveMat) || isApproved || showResubmitCta ? (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + 12,
              backgroundColor: t.colors.surface,
              borderTopColor: t.colors.separator,
              borderTopWidth: t.hairline,
            },
          ]}
        >
          {isPending && canApproveMat ? (
            <>
              {showApproverEditCta ? (
                <Pressable
                  onPress={handleEdit}
                  disabled={actionLoading}
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
                  <Ionicons name="create-outline" size={16} color={t.palette.blue.base} />
                  <Text
                    variant="footnote"
                    style={{
                      color: t.palette.blue.base,
                      fontWeight: '700',
                      marginLeft: 6,
                    }}
                  >
                    Edit before approving
                  </Text>
                </Pressable>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => setShowRejectModal(true)}
                  disabled={actionLoading}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    {
                      flex: 1,
                      backgroundColor:
                        t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                      borderRadius: t.radii.field,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Ionicons name="close-circle-outline" size={16} color={t.palette.red.base} />
                  <Text
                    variant="footnote"
                    style={{
                      color: t.palette.red.base,
                      fontWeight: '700',
                      marginLeft: 6,
                    }}
                  >
                    Reject
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleApprove}
                  disabled={actionLoading}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    {
                      flex: 1,
                      backgroundColor: t.palette.green.base,
                      borderRadius: t.radii.field,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                      <Text
                        variant="footnote"
                        style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}
                      >
                        Approve
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </>
          ) : null}

          {showResubmitCta ? (
            <Pressable
              onPress={handleResubmit}
              disabled={actionLoading}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: t.palette.blue.base,
                  borderRadius: t.radii.field,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons name="refresh-outline" size={16} color="#fff" />
              <Text
                variant="footnote"
                style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}
              >
                Edit & re-submit
              </Text>
            </Pressable>
          ) : null}

          {isApproved ? (
            <Pressable
              onPress={handleShare}
              disabled={actionLoading}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: t.palette.blue.base,
                  borderRadius: t.radii.field,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="share-outline" size={16} color="#fff" />
              )}
              <Text
                variant="footnote"
                style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}
              >
                {actionLoading ? 'Generating…' : 'Share to shop (no prices)'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Reject sheet */}
      <Modal
        visible={showRejectModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRejectModal(false)}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowRejectModal(false)} />
          <View
            style={[
              styles.bottomSheet,
              {
                backgroundColor: t.colors.surface,
                borderTopLeftRadius: t.radii.sheet,
                borderTopRightRadius: t.radii.sheet,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: t.colors.tertiary }]} />
            <Text
              variant="headline"
              color="label"
              style={{ paddingHorizontal: 16, fontWeight: '700' }}
            >
              Reject request
            </Text>
            <TextInput
              placeholder="Reason for rejection (optional)"
              placeholderTextColor={t.colors.tertiary}
              value={rejectNote}
              onChangeText={setRejectNote}
              multiline
              style={[
                styles.rejectInput,
                {
                  backgroundColor: t.colors.fill3,
                  borderRadius: t.radii.field,
                  color: t.colors.label,
                  minHeight: 80,
                  textAlignVertical: 'top',
                },
              ]}
            />
            <View style={[styles.sheetActions, { paddingHorizontal: 16, marginTop: 14 }]}>
              <Pressable
                onPress={() => setShowRejectModal(false)}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    flex: 1,
                    backgroundColor: t.colors.fill3,
                    borderRadius: t.radii.field,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text variant="footnote" color="secondary" style={{ fontWeight: '700' }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleReject}
                disabled={actionLoading}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    flex: 1,
                    backgroundColor: t.palette.red.base,
                    borderRadius: t.radii.field,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text variant="footnote" style={{ color: '#fff', fontWeight: '700' }}>
                    Reject
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delivery sheet */}
      <Modal
        visible={showDeliveryPicker !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDeliveryPicker(null)}
        statusBarTranslucent
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setShowDeliveryPicker(null)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.deliverySheet,
              {
                backgroundColor: t.colors.surface,
                borderTopLeftRadius: t.radii.sheet,
                borderTopRightRadius: t.radii.sheet,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: t.colors.tertiary }]} />
            <Text
              variant="headline"
              color="label"
              style={{ textAlign: 'center', fontWeight: '600', paddingBottom: 12 }}
            >
              Delivery status
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {DELIVERY_STATUSES.map((s, i) => {
                const currentStatus =
                  showDeliveryPicker !== null
                    ? request.items[showDeliveryPicker]?.deliveryStatus
                    : '';
                const active = currentStatus === s.key;
                return (
                  <View key={s.key}>
                    <Pressable
                      onPress={() =>
                        showDeliveryPicker !== null &&
                        handleDeliveryUpdate(showDeliveryPicker, s.key)
                      }
                      style={({ pressed }) => [
                        styles.deliveryOption,
                        pressed && { backgroundColor: t.colors.fill3 },
                      ]}
                    >
                      <Ionicons
                        name={s.icon as keyof typeof Ionicons.glyphMap}
                        size={18}
                        color={s.color}
                      />
                      <Text
                        variant="body"
                        color="label"
                        style={{ flex: 1, marginLeft: 12, fontWeight: active ? '600' : '400' }}
                      >
                        {s.label}
                      </Text>
                      {active ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={t.palette.blue.base}
                        />
                      ) : null}
                    </Pressable>
                    {i < DELIVERY_STATUSES.length - 1 ? (
                      <View
                        style={{
                          height: t.hairline,
                          backgroundColor: t.colors.separator,
                          marginLeft: 16,
                        }}
                      />
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ItemRow({
  item,
  index,
  showPrice,
  showDelivery,
  onDeliveryPress,
}: {
  item: MaterialRequestItem;
  index: number;
  showPrice: boolean;
  showDelivery: boolean;
  onDeliveryPress: () => void;
}) {
  const t = useThemeV2();
  const ds = DELIVERY_STATUSES.find((s) => s.key === item.deliveryStatus) ?? DELIVERY_STATUSES[0];
  const catConfig = item.category ? getCategoryConfig(item.category as MaterialCategory) : null;
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View
        style={[
          styles.itemRow,
          {
            backgroundColor: cardBg,
            borderRadius: t.radii.card,
            borderColor: cardBorder,
            borderWidth: t.hairline,
          },
        ]}
      >
        <View style={styles.itemNum}>
          <Text variant="caption2" color="tertiary" style={{ fontWeight: '700' }}>
            {index + 1}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {catConfig ? (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: t.colors.tertiary,
                }}
              />
            ) : null}
            <Text
              variant="callout"
              color="label"
              style={{ flex: 1, fontWeight: '600' }}
              numberOfLines={1}
            >
              {item.name}
            </Text>
          </View>
          <Text variant="caption1" color="secondary" numberOfLines={1} style={{ marginTop: 2 }}>
            {[catConfig?.label, item.brand, item.variety, item.size].filter(Boolean).join(' · ')}
          </Text>
          <Text variant="footnote" color="label" style={{ marginTop: 4, fontWeight: '600' }}>
            {item.quantity} {item.unit}
            {showPrice ? ` × ₹${item.rate} = ${formatInr(item.totalCost)}` : ''}
          </Text>
        </View>
        {showDelivery ? (
          <Pressable
            onPress={onDeliveryPress}
            hitSlop={6}
            style={({ pressed }) => [
              styles.deliveryChip,
              {
                backgroundColor: ds.color + '22',
                borderColor: ds.color + '55',
                borderWidth: 1,
                borderRadius: 999,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name={ds.icon as keyof typeof Ionicons.glyphMap} size={11} color={ds.color} />
            <Text
              variant="caption2"
              style={{
                color: ds.color,
                fontWeight: '700',
                marginLeft: 4,
                letterSpacing: 0.3,
              }}
            >
              {ds.label.toUpperCase()}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Header({
  onBack,
  title,
  right,
}: {
  onBack: () => void;
  title: string;
  right?: React.ReactNode;
}) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + 8,
          borderBottomColor: t.colors.separator,
          borderBottomWidth: t.hairline,
        },
      ]}
    >
      <CircleBtn icon="chevron-back" onPress={onBack} tint={t.colors.label} />
      <Text
        variant="headline"
        color="label"
        style={{ flex: 1, textAlign: 'center', fontWeight: '600' }}
        numberOfLines={1}
      >
        {title}
      </Text>
      {right ?? <View style={{ width: 32 }} />}
    </View>
  );
}

function CircleBtn({
  icon,
  onPress,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tint: string;
}) {
  const t = useThemeV2();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [
        styles.circleBtn,
        {
          backgroundColor: t.colors.surface,
          borderRadius: 999,
          borderColor:
            t.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          borderWidth: t.hairline,
        },
        t.shadows.resting,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={icon} size={16} color={tint} />
    </Pressable>
  );
}

/** KPI tile — neutral by design (90/10 colour discipline). `tone`/`bg`
 *  props accepted for back-compat but ignored. */
function Kpi({
  label,
  value,
}: {
  label: string;
  value: string;
  /** @deprecated value renders in neutral label colour. */
  tone?: string;
  /** @deprecated dot renders with neutral fill3 background. */
  bg?: string;
}) {
  const t = useThemeV2();
  return (
    <View
      style={[
        styles.kpiTile,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.card,
          borderColor:
            t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
      ]}
    >
      <View style={[styles.kpiDot, { backgroundColor: t.colors.fill3 }]}>
        <View style={[styles.kpiDotInner, { backgroundColor: t.colors.tertiary }]} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.4, fontSize: 9 }}>
          {label}
        </Text>
        <Text
          variant="footnote"
          color="label"
          style={{
            fontWeight: '600',
            fontVariant: ['tabular-nums'],
            marginTop: 1,
          }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  circleBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: {},

  heroCard: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  progressBlock: {
    marginTop: 14,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },

  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  kpiTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  kpiDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  kpiDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  rejectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  itemNum: { width: 22, alignItems: 'center' },
  deliveryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 0,
  },

  // Footer
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },

  // Bottom sheets
  bottomSheet: { paddingTop: 8 },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 12,
  },
  rejectInput: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 8,
  },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  deliverySheet: {
    paddingTop: 8,
    maxHeight: '70%',
  },
  deliveryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
