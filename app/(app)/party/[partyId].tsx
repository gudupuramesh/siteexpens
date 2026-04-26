/**
 * Party detail — read-only preview.
 * Shows basic info, KYC, opening balance, bank details. Edit pencil in the
 * top-right routes to the edit-party form.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useParties } from '@/src/features/parties/useParties';
import { getPartyTypeLabel } from '@/src/features/parties/types';
import { formatDate, formatInr } from '@/src/lib/format';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

export default function PartyDetailScreen() {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { data: parties, loading } = useParties(orgId);

  const party = useMemo(() => parties.find((p) => p.id === partyId), [parties, partyId]);

  if (loading && !party) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loading}>
          <Text variant="meta" color="textMuted">Loading…</Text>
        </View>
      </Screen>
    );
  }

  if (!party) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.navBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={22} color={color.text} />
          </Pressable>
          <Text variant="bodyStrong" color="text" style={styles.navTitle}>Party</Text>
          <View style={styles.navBtn} />
        </View>
        <View style={styles.loading}>
          <Text variant="meta" color="textMuted">Party not found.</Text>
        </View>
      </Screen>
    );
  }

  const typeLabel = party.partyType
    ? getPartyTypeLabel(party.partyType)
    : (party.role ?? '—');
  const openingBalance = party.openingBalance ?? 0;
  const isToReceive = party.openingBalanceType === 'to_receive';
  const bank = party.bankDetails;
  const hasBank =
    !!bank &&
    !!(bank.accountNumber || bank.ifsc || bank.bankName || bank.upiId || bank.accountHolderName);

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color={color.text} />
        </Pressable>
        <Text variant="bodyStrong" color="text" style={styles.navTitle}>Party</Text>
        <Pressable
          onPress={() => router.push(`/(app)/add-party?partyId=${party.id}` as never)}
          hitSlop={12}
          style={styles.navBtn}
        >
          <Ionicons name="create-outline" size={20} color={color.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity card */}
        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text variant="title" style={{ color: color.primary }}>
              {party.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text variant="title" color="text" align="center" style={{ marginTop: space.xs }}>
            {party.name}
          </Text>
          <View style={styles.typePill}>
            <Text variant="caption" color="primary">{typeLabel}</Text>
          </View>
        </View>

        {/* Contact */}
        <View style={styles.card}>
          <Text variant="caption" color="textMuted" style={styles.cardLabel}>CONTACT</Text>
          <DetailRow
            icon="call-outline"
            label="Phone"
            value={party.phone || '—'}
          />
          {!!party.email && (
            <>
              <Divider />
              <DetailRow icon="mail-outline" label="Email" value={party.email} />
            </>
          )}
          {!!party.fatherName && (
            <>
              <Divider />
              <DetailRow icon="person-outline" label="Father" value={party.fatherName} />
            </>
          )}
          {!!party.dateOfJoining && (
            <>
              <Divider />
              <DetailRow
                icon="calendar-outline"
                label="Joined"
                value={formatDate(party.dateOfJoining.toDate())}
              />
            </>
          )}
          {!!party.address && (
            <>
              <Divider />
              <DetailRow
                icon="location-outline"
                label="Address"
                value={party.address}
                multiline
              />
            </>
          )}
        </View>

        {/* Opening balance */}
        {openingBalance > 0 && (
          <View style={styles.card}>
            <Text variant="caption" color="textMuted" style={styles.cardLabel}>
              OPENING BALANCE
            </Text>
            <View style={styles.balanceRow}>
              <Ionicons
                name={isToReceive ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                size={20}
                color={isToReceive ? color.success : color.danger}
              />
              <View style={styles.flex}>
                <Text
                  variant="title"
                  style={{ color: isToReceive ? color.success : color.danger }}
                >
                  {formatInr(openingBalance)}
                </Text>
                <Text variant="caption" color="textMuted">
                  {isToReceive ? 'They owe you (To Receive)' : 'You owe them (To Pay)'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* KYC */}
        {(party.aadharNumber || party.panNumber) && (
          <View style={styles.card}>
            <Text variant="caption" color="textMuted" style={styles.cardLabel}>KYC</Text>
            {!!party.aadharNumber && (
              <DetailRow
                icon="card-outline"
                label="Aadhar"
                value={maskAadhar(party.aadharNumber)}
              />
            )}
            {!!party.aadharNumber && !!party.panNumber && <Divider />}
            {!!party.panNumber && (
              <DetailRow
                icon="document-text-outline"
                label="PAN"
                value={party.panNumber}
              />
            )}
          </View>
        )}

        {/* Bank */}
        {hasBank && bank && (
          <View style={styles.card}>
            <Text variant="caption" color="textMuted" style={styles.cardLabel}>BANK</Text>
            {!!bank.accountHolderName && (
              <DetailRow
                icon="person-outline"
                label="Account Holder"
                value={bank.accountHolderName}
              />
            )}
            {!!bank.bankName && (
              <>
                {!!bank.accountHolderName && <Divider />}
                <DetailRow
                  icon="business-outline"
                  label="Bank"
                  value={bank.bankName}
                />
              </>
            )}
            {!!bank.accountNumber && (
              <>
                <Divider />
                <DetailRow
                  icon="wallet-outline"
                  label="A/c No."
                  value={maskAccount(bank.accountNumber)}
                />
              </>
            )}
            {!!bank.ifsc && (
              <>
                <Divider />
                <DetailRow icon="pricetag-outline" label="IFSC" value={bank.ifsc} />
              </>
            )}
            {!!bank.upiId && (
              <>
                <Divider />
                <DetailRow
                  icon="phone-portrait-outline"
                  label="UPI"
                  value={bank.upiId}
                />
              </>
            )}
          </View>
        )}

        <View style={{ height: space.xl }} />
      </ScrollView>
    </Screen>
  );
}

function DetailRow({
  icon,
  label,
  value,
  multiline,
}: {
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={[styles.metaRow, multiline && styles.metaRowMultiline]}>
      <Ionicons name={icon} size={16} color={color.textMuted} />
      <Text variant="caption" color="textMuted" style={styles.metaLabel}>
        {label}
      </Text>
      <Text
        variant="meta"
        color="text"
        style={multiline ? styles.metaValueMultiline : styles.metaValue}
      >
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function maskAadhar(n: string): string {
  const digits = n.replace(/\D/g, '');
  if (digits.length < 4) return n;
  return `XXXX XXXX ${digits.slice(-4)}`;
}

function maskAccount(n: string): string {
  if (n.length <= 4) return n;
  return `••••${n.slice(-4)}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingBottom: space.xs,
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center' },
  scroll: { padding: screenInset, gap: space.sm },

  identityCard: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    alignItems: 'center',
    gap: space.xs,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typePill: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: color.primarySoft,
  },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  cardLabel: { marginTop: space.sm, marginBottom: space.xxs },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
  },
  metaRowMultiline: { alignItems: 'flex-start' },
  metaLabel: { width: 110, marginLeft: 4 },
  metaValue: { flex: 1, textAlign: 'right' },
  metaValueMultiline: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.separator },

  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
  },
});
