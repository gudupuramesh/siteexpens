/**
 * Material Request Detail — view items, approve/reject, update delivery status, share to shop.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/src/features/auth/useAuth';
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
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

export default function MaterialRequestDetailScreen() {
  const params = useLocalSearchParams<{ id: string; reqId: string }>();
  const projectId = params.id;
  const reqId = params.reqId;

  const { user } = useAuth();
  const { data: project } = useProject(projectId);
  const { data: request, loading } = useMaterialRequest(reqId);

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeliveryPicker, setShowDeliveryPicker] = useState<number | null>(null);

  const isOwner = user?.uid === project?.ownerId;
  const isApprover = isOwner || ((project as any)?.approverIds?.includes(user?.uid) ?? false);
  const isPending = request?.status === 'pending';
  const isApproved = request?.status === 'approved';

  const receivedCount = request?.items.filter((i) => i.deliveryStatus === 'received_at_site').length ?? 0;
  const totalItems = request?.items.length ?? 0;

  // ── Actions ──

  const handleApprove = useCallback(async () => {
    if (!reqId || !user) return;
    Alert.alert('Approve Request', 'Approve this material request?', [
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
    if (!reqId) return;
    setActionLoading(true);
    try {
      await rejectRequest(reqId, rejectNote.trim() || 'Rejected');
      setShowRejectModal(false);
      setRejectNote('');
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }, [reqId, rejectNote]);

  const handleDeliveryUpdate = useCallback(async (idx: number, status: DeliveryStatus) => {
    if (!reqId) return;
    try {
      await updateItemDeliveryStatus(reqId, idx, status);
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
    setShowDeliveryPicker(null);
  }, [reqId]);

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
    Alert.alert('Delete Request', 'This cannot be undone.', [
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

  if (loading || !request) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="meta" color="textMuted">Loading...</Text>
        </View>
      </Screen>
    );
  }

  const badge = statusBadge(request.status);
  const dateStr = request.createdAt
    ? request.createdAt.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.surface }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav */}
      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={22} color={color.text} />
        </Pressable>
        <Text variant="bodyStrong" color="text" style={styles.navTitle} numberOfLines={1}>
          {request.title || 'Material Request'}
        </Text>
        {isPending && (
          <Pressable onPress={handleDelete} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="trash-outline" size={20} color={color.danger} />
          </Pressable>
        )}
        {!isPending && <View style={styles.navBtn} />}
      </View>

      {/* Status header */}
      <View style={[styles.statusBar, { backgroundColor: badge.bg }]}>
        <View style={[styles.statusDot, { backgroundColor: badge.fg }]} />
        <Text variant="metaStrong" style={{ color: badge.fg }}>{badge.label}</Text>
        <View style={{ flex: 1 }} />
        <Text variant="meta" color="textMuted">{dateStr}</Text>
      </View>

      {/* Progress (if approved) */}
      {isApproved && totalItems > 0 && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(receivedCount / totalItems) * 100}%` }]} />
          <Text variant="caption" color="text" style={styles.progressText}>
            {receivedCount}/{totalItems} received at site
          </Text>
        </View>
      )}

      {/* Items list */}
      <FlatList
        data={request.items}
        keyExtractor={(_, idx) => String(idx)}
        renderItem={({ item, index }) => (
          <ItemRow
            item={item}
            index={index}
            showPrice={isApprover}
            showDelivery={isApproved}
            onDeliveryPress={() => setShowDeliveryPicker(index)}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          isApprover ? (
            <View style={styles.totalRow}>
              <Text variant="bodyStrong" color="text">Total Value</Text>
              <Text variant="bodyStrong" color="primary">{formatInr(request.totalValue)}</Text>
            </View>
          ) : null
        }
      />

      {/* Rejection note */}
      {request.status === 'rejected' && request.rejectionNote && (
        <View style={styles.rejectionBar}>
          <Ionicons name="close-circle" size={16} color={color.danger} />
          <Text variant="meta" color="danger" style={{ flex: 1 }}>{request.rejectionNote}</Text>
        </View>
      )}

      {/* Action footer */}
      {(isPending && isApprover) || isApproved ? (
        <View style={styles.footer}>
          {isPending && isApprover && (
            <View style={styles.footerRow}>
              <Pressable
                onPress={() => setShowRejectModal(true)}
                style={[styles.actionBtn, styles.rejectBtn]}
                disabled={actionLoading}
              >
                <Ionicons name="close-circle-outline" size={18} color={color.danger} />
                <Text variant="metaStrong" color="danger">Reject</Text>
              </Pressable>
              <Pressable
                onPress={handleApprove}
                style={[styles.actionBtn, styles.approveBtn]}
                disabled={actionLoading}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text variant="metaStrong" style={{ color: '#fff' }}>Approve</Text>
              </Pressable>
            </View>
          )}
          {isApproved && (
            <Pressable
              onPress={handleShare}
              style={[styles.actionBtn, styles.shareBtn]}
              disabled={actionLoading}
            >
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text variant="metaStrong" style={{ color: '#fff' }}>
                {actionLoading ? 'Generating...' : 'Share to Shop (No Prices)'}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {/* Reject Modal */}
      <Modal visible={showRejectModal} animationType="fade" transparent onRequestClose={() => setShowRejectModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowRejectModal(false)}><View /></Pressable>
        <View style={styles.rejectSheet}>
          <Text variant="bodyStrong" color="text" style={{ marginBottom: space.sm }}>Reject Request</Text>
          <TextInput
            placeholder="Reason for rejection (optional)"
            placeholderTextColor={color.textFaint}
            value={rejectNote}
            onChangeText={setRejectNote}
            multiline
            style={styles.rejectInput}
          />
          <View style={styles.rejectActions}>
            <Pressable onPress={() => setShowRejectModal(false)} style={[styles.actionBtn, { borderColor: color.border, borderWidth: 1, flex: 1 }]}>
              <Text variant="metaStrong" color="text">Cancel</Text>
            </Pressable>
            <Pressable onPress={handleReject} style={[styles.actionBtn, styles.rejectBtn, { flex: 1 }]} disabled={actionLoading}>
              <Text variant="metaStrong" color="danger">{actionLoading ? 'Rejecting...' : 'Reject'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Delivery Status Picker */}
      <Modal visible={showDeliveryPicker !== null} animationType="fade" transparent onRequestClose={() => setShowDeliveryPicker(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowDeliveryPicker(null)}><View /></Pressable>
        <View style={styles.deliverySheet}>
          <Text variant="bodyStrong" color="text" style={{ marginBottom: space.sm, textAlign: 'center' }}>
            Update Delivery Status
          </Text>
          {DELIVERY_STATUSES.map((s) => {
            const currentStatus = showDeliveryPicker !== null ? request.items[showDeliveryPicker]?.deliveryStatus : '';
            const active = currentStatus === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => showDeliveryPicker !== null && handleDeliveryUpdate(showDeliveryPicker, s.key)}
                style={[styles.deliveryOption, active && { backgroundColor: color.primarySoft }]}
              >
                <Ionicons name={s.icon as any} size={20} color={s.color} />
                <Text variant="body" color={active ? 'primary' : 'text'} style={active ? { fontWeight: '600' } : undefined}>
                  {s.label}
                </Text>
                {active && <Ionicons name="checkmark-circle" size={18} color={color.primary} style={{ marginLeft: 'auto' }} />}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </Screen>
  );
}

// ── Item Row ──

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
  const ds = DELIVERY_STATUSES.find((s) => s.key === item.deliveryStatus) ?? DELIVERY_STATUSES[0];
  const catConfig = item.category ? getCategoryConfig(item.category as MaterialCategory) : null;

  return (
    <View style={styles.itemRow}>
      <View style={styles.itemNum}>
        <Text variant="caption" color="textMuted">{index + 1}</Text>
      </View>
      <View style={styles.itemBody}>
        <View style={styles.itemNameRow}>
          {catConfig && (
            <View style={[styles.catDot, { backgroundColor: catConfig.color }]} />
          )}
          <Text variant="rowTitle" color="text" numberOfLines={1} style={{ flex: 1 }}>{item.name}</Text>
        </View>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {[catConfig?.label, item.brand, item.variety, item.size].filter(Boolean).join(' · ')}
        </Text>
        <Text variant="meta" color="text">
          {item.quantity} {item.unit}
          {showPrice ? ` × ₹${item.rate} = ${formatInr(item.totalCost)}` : ''}
        </Text>
      </View>
      {showDelivery && (
        <Pressable onPress={onDeliveryPress} style={[styles.deliveryChip, { borderColor: ds.color }]}>
          <Ionicons name={ds.icon as any} size={14} color={ds.color} />
          <Text variant="caption" style={{ color: ds.color }}>{ds.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

function statusBadge(status: string) {
  switch (status) {
    case 'pending': return { bg: color.warningSoft, fg: color.warning, label: 'Pending Approval' };
    case 'approved': return { bg: color.successSoft, fg: color.success, label: 'Approved' };
    case 'rejected': return { bg: color.dangerSoft, fg: color.danger, label: 'Rejected' };
    default: return { bg: color.primarySoft, fg: color.primary, label: 'Draft' };
  }
}

const styles = StyleSheet.create({
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: screenInset, paddingBottom: space.xxs, backgroundColor: color.surface },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center' },

  statusBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: space.xs, paddingHorizontal: screenInset },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  progressBar: { height: 24, backgroundColor: color.bgGrouped, marginHorizontal: screenInset, marginTop: space.xs, borderRadius: radius.sm, overflow: 'hidden', justifyContent: 'center' },
  progressFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: color.successSoft, borderRadius: radius.sm },
  progressText: { textAlign: 'center', zIndex: 1 },

  listContent: { paddingBottom: 20 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: screenInset, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.separator },
  itemNum: { width: 24, alignItems: 'center' },
  itemBody: { flex: 1, gap: 1 },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  deliveryChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: space.xs, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1 },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.md, paddingVertical: space.md, borderTopWidth: 1, borderTopColor: color.separator, backgroundColor: color.primarySoft, marginHorizontal: screenInset, borderRadius: radius.sm, marginTop: space.sm },

  rejectionBar: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: screenInset, paddingVertical: space.sm, backgroundColor: color.dangerSoft },

  footer: { paddingHorizontal: screenInset, paddingVertical: space.sm, backgroundColor: color.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.separator },
  footerRow: { flexDirection: 'row', gap: space.sm },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.sm, borderRadius: radius.sm },
  approveBtn: { backgroundColor: color.success },
  rejectBtn: { backgroundColor: color.dangerSoft, borderWidth: 1, borderColor: color.danger },
  shareBtn: { backgroundColor: color.primary },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  rejectSheet: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginHorizontal: screenInset * 2, width: '85%', alignSelf: 'center' },
  rejectInput: { borderWidth: 1, borderColor: color.border, borderRadius: radius.sm, padding: space.sm, fontSize: 14, color: color.text, minHeight: 80, textAlignVertical: 'top', marginBottom: space.sm },
  rejectActions: { flexDirection: 'row', gap: space.sm },

  deliverySheet: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginHorizontal: screenInset * 2, width: '85%', alignSelf: 'center' },
  deliveryOption: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.xs, borderRadius: radius.sm },
});
