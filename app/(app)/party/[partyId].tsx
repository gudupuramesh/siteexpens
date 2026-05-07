/**
 * Party detail — read-only preview.
 * Shows basic info, KYC, opening balance, bank details. Edit pencil in the
 * top-right routes to the edit-party form.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useParties } from '@/src/features/parties/useParties';
import { getPartyTypeLabel } from '@/src/features/parties/types';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import {
  normalizeTransactionType,
  type Transaction,
} from '@/src/features/transactions/types';
import { formatDate, formatInr } from '@/src/lib/format';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, fontFamily, radius, screenInset, space } from '@/src/theme';

export default function PartyDetailScreen() {
  // `projectId` is optional — when present (i.e. the user landed here from
  // a project's Party tab), we render a project-scoped Transactions
  // section listing every txn that links this party to that project.
  const { partyId, projectId } = useLocalSearchParams<{
    partyId: string;
    projectId?: string;
  }>();
  const projectIdValue = projectId && projectId.length > 0 ? projectId : undefined;
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { data: parties, loading } = useParties(orgId);
  const { data: allProjectTxns } = useTransactions(projectIdValue);

  const party = useMemo(() => parties.find((p) => p.id === partyId), [parties, partyId]);

  // Filter the project's transactions down to this party. Done client-side
  // because the project's full txn list is already streaming for other
  // tabs — adding a separate Firestore listener per party would just
  // duplicate the snapshot.
  const partyTxns = useMemo(
    () => allProjectTxns.filter((t) => t.partyId === partyId),
    [allProjectTxns, partyId],
  );

  const partyTotals = useMemo(() => {
    let received = 0;
    let paid = 0;
    for (const t of partyTxns) {
      const type = normalizeTransactionType(t.type);
      if (type === 'payment_in') received += t.amount;
      else paid += t.amount;
    }
    return { received, paid, net: received - paid };
  }, [partyTxns]);

  // Detail cards (Contact, Opening Balance, KYC, Bank) are tucked
  // behind a chevron toggle on the identity strip. Default-collapsed
  // so the page leads with what users actually open it for: the
  // transactions list. Tap the identity strip (or the chevron) to
  // reveal the rest.
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Back handler — falls back to the parties list when there's no
  // navigation history (e.g. user arrived via a deep link). Without
  // the canGoBack guard `router.back()` is a no-op on a fresh stack
  // and the user gets stuck on the page.
  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)' as never);
  };

  if (loading && !party) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        {/* Always render the nav bar so the back button is reachable
            even while the party doc is still streaming — without
            this the user gets a "Loading…" screen with no way out. */}
        <View style={styles.navBar}>
          <Pressable onPress={onBack} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={22} color={color.text} />
          </Pressable>
          <Text variant="bodyStrong" color="text" style={styles.navTitle}>Party</Text>
          <View style={styles.navBtn} />
        </View>
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
          <Pressable onPress={onBack} hitSlop={12} style={styles.navBtn}>
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
        <Pressable onPress={onBack} hitSlop={12} style={styles.navBtn}>
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
        {/* Identity strip — compact horizontal layout (was a tall
            centred card that wasted half the viewport). Avatar +
            name + type sit on one row, dense like an InteriorOS
            list header. The whole row is a toggle: tap to expand /
            collapse the verbose Contact / Balance / KYC / Bank
            cards below. Default state is collapsed. */}
        <Pressable
          onPress={() => setDetailsOpen((v) => !v)}
          style={({ pressed }) => [
            styles.identityStrip,
            pressed && { backgroundColor: color.surface },
          ]}
        >
          <View style={styles.avatarSm}>
            <Text variant="bodyStrong" style={{ color: color.primary }}>
              {party.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" color="text" numberOfLines={1}>
              {party.name}
            </Text>
            <Text style={styles.identityMeta} numberOfLines={1}>
              {typeLabel.toUpperCase()}
              {!detailsOpen ? '  ·  TAP FOR DETAILS' : ''}
            </Text>
          </View>
          <Ionicons
            name={detailsOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={color.textMuted}
          />
        </Pressable>

        {/* Verbose detail cards (Contact / Balance / KYC / Bank) —
            collapsed by default; tap the identity strip to expand. */}
        {detailsOpen ? (
        <>
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
        </>
        ) : null}
        {/* End of expandable detail cards. */}

        {/* Project-scoped transactions — only when we landed here from
            a project's Party tab (projectId in the route). Header row
            shows a single context-aware summary instead of the
            received/paid/net grid (which was confusing for one-sided
            parties like vendors who only ever get paid). */}
        {projectIdValue ? (
          <View style={styles.card}>
            {/* Stat block — label, prominent NET, muted breakdown.
                Split across three lines so the long mixed-direction
                summary never truncates. */}
            <View style={styles.txnStatBlock}>
              <Text style={styles.txnStatLabel}>
                TRANSACTIONS · {partyTxns.length}
              </Text>
              <TxnStat totals={partyTotals} />
            </View>

            {partyTxns.length === 0 ? (
              <Text variant="meta" color="textMuted" style={styles.txnEmpty}>
                No transactions recorded with this party on this project yet.
              </Text>
            ) : (
              partyTxns.map((t, i) => (
                <View key={t.id}>
                  {i > 0 ? <View style={styles.txnRowDivider} /> : null}
                  <PartyTxnRow
                    txn={t}
                    onPress={() =>
                      router.push(
                        `/(app)/projects/${projectIdValue}/transaction/${t.id}` as never,
                      )
                    }
                  />
                </View>
              ))
            )}
          </View>
        ) : null}

        <View style={{ height: space.xl }} />
      </ScrollView>
    </Screen>
  );
}

/** Stacked stat block for the transactions section header.
 *  Lines: prominent NET (or single-direction total) + muted breakdown
 *  on its own line below. Avoids the truncation problem the inline
 *  one-liner had on long mixed-direction strings. */
function TxnStat({ totals }: { totals: { received: number; paid: number; net: number } }) {
  if (totals.received === 0 && totals.paid === 0) {
    return <Text style={styles.txnStatPrimary}>—</Text>;
  }
  if (totals.received > 0 && totals.paid === 0) {
    // Single-direction (client / refund-only): drop the leading '+'.
    // The green colour + the word "received" already convey direction;
    // the sign is redundant noise here.
    return (
      <Text style={[styles.txnStatPrimary, { color: color.success }]}>
        {formatInr(totals.received)}
        <Text style={styles.txnStatTrail}>  received</Text>
      </Text>
    );
  }
  if (totals.paid > 0 && totals.received === 0) {
    // Single-direction (vendor / sub-contractor): drop the leading '−'.
    // Red colour + "paid" already convey direction.
    return (
      <Text style={[styles.txnStatPrimary, { color: color.danger }]}>
        {formatInr(totals.paid)}
        <Text style={styles.txnStatTrail}>  paid</Text>
      </Text>
    );
  }
  // Mixed — NET on top line, breakdown on muted second line.
  const netSign = totals.net > 0 ? '+' : totals.net < 0 ? '−' : '';
  const netColor = totals.net > 0 ? color.success : totals.net < 0 ? color.danger : color.textMuted;
  return (
    <>
      <Text style={[styles.txnStatPrimary, { color: netColor }]}>
        {netSign}
        {formatInr(Math.abs(totals.net))}
        <Text style={styles.txnStatTrail}>  net</Text>
      </Text>
      <Text style={styles.txnStatBreakdown}>
        Paid {formatInr(totals.paid)}  ·  Received {formatInr(totals.received)}
      </Text>
    </>
  );
}

/** A single transaction row — matches the InteriorOS dense list style
 *  used in the project's TransactionTab: square hairline-bordered icon
 *  tile, mono tabular amount, single-line description + meta. */
function PartyTxnRow({
  txn,
  onPress,
}: {
  txn: Transaction;
  onPress: () => void;
}) {
  const type = normalizeTransactionType(txn.type);
  const isIn = type === 'payment_in';
  const dateLabel = txn.date ? formatDate(txn.date.toDate()) : '—';
  const meta = [
    dateLabel,
    txn.paymentMethod ? formatPaymentMethod(txn.paymentMethod) : null,
    txn.referenceNumber ? `Ref ${txn.referenceNumber}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.txnRow, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.txnIcon}>
        <Ionicons
          name={isIn ? 'wallet-outline' : 'receipt-outline'}
          size={14}
          color={isIn ? color.success : color.textMuted}
        />
      </View>
      <View style={styles.txnBody}>
        <Text variant="rowTitle" color="text" numberOfLines={1}>
          {txn.description || (isIn ? 'Payment received' : 'Payment made')}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text
        style={[
          styles.txnAmount,
          { color: isIn ? color.success : color.danger },
        ]}
      >
        {isIn ? '+' : '−'}
        {formatInr(txn.amount)}
      </Text>
    </Pressable>
  );
}

function formatPaymentMethod(m: string): string {
  return m
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Context-aware one-line summary for a party's transactions:
 *   - Vendor / sub-contractor (only payments out)  → "Paid ₹X"
 *   - Client (only payments in)                    → "Received ₹X"
 *   - Mixed (both directions)                      → "Net ±₹N (paid ₹X · received ₹Y)"
 *   - None                                          → "—"
 *
 *  For the Mixed case we lead with the NET (running balance) so the
 *  user sees who-owes-whom up front, with the gross numbers in
 *  parentheses for audit. Real-world hits: vendor refunding an
 *  advance, client refund, milestone adjustments. */
function buildTxnSummary(t: { received: number; paid: number; net: number }): string {
  if (t.received === 0 && t.paid === 0) return '—';
  if (t.received > 0 && t.paid === 0) return `Received ${formatInr(t.received)}`;
  if (t.paid > 0 && t.received === 0) return `Paid ${formatInr(t.paid)}`;
  // Mixed: show NET (signed) with gross breakdown. Order the parens
  // by which side is bigger so the dominant flow reads first.
  const netAbs = formatInr(Math.abs(t.net));
  const sign = t.net > 0 ? '+' : t.net < 0 ? '−' : '';
  const breakdown =
    t.paid >= t.received
      ? `paid ${formatInr(t.paid)} · received ${formatInr(t.received)}`
      : `received ${formatInr(t.received)} · paid ${formatInr(t.paid)}`;
  return `Net ${sign}${netAbs} (${breakdown})`;
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
    // InteriorOS card style: white background, hairline border, no
    // border-radius — sits flush on the grouped canvas below it. The
    // surrounding ScrollView provides the screen-inset padding + gap
    // between cards, so this style stays margin-free.
    backgroundColor: color.bg,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
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

  // Compact identity strip (replaces the tall centred identity card).
  identityStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: color.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },
  avatarSm: {
    // Square tile to match the InteriorOS sharp-corner language used
    // in ProjectRow / TransactionTab icons.
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityMeta: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 1.2,
    marginTop: 2,
  },

  // Transactions stat block — label + prominent NET + muted breakdown.
  txnStatBlock: {
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
    gap: 2,
  },
  txnStatLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.2,
  },
  txnStatPrimary: {
    fontFamily: fontFamily.sans,
    fontSize: 22,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.4,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  txnStatTrail: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 1.2,
  },
  txnStatBreakdown: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    color: color.textMuted,
    letterSpacing: 0.4,
    marginTop: 2,
  },

  txnEmpty: {
    paddingVertical: space.md,
    textAlign: 'center',
  },

  // List rows — match TransactionTab.tsx for visual consistency.
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  txnRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.borderStrong,
  },
  txnIcon: {
    // Square hairline tile (same as TransactionTab's txnIcon).
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  txnAmount: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
