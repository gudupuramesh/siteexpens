/**
 * Party detail — v2 design.
 *
 * Layout (top → bottom):
 *   1. v2 header: back · "Party" · circular blue Edit pen
 *   2. Identity hero card — large tone-tinted avatar tile + name + type pill
 *   3. Opening balance card (only when > 0) — colored side rail + amount
 *   4. FormGroup "Contact" — Phone/Email/Father/Joined/Address rows
 *   5. FormGroup "KYC" — Aadhar (masked)/PAN (only when present)
 *   6. FormGroup "Bank" — Holder/Bank/Account (masked)/IFSC/UPI (only when present)
 *   7. (When opened from a project) Transactions card — total summary +
 *      per-txn rows
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useParties } from '@/src/features/parties/useParties';
import {
  getPartyTypeLabel,
  type Party,
  type PartyType,
} from '@/src/features/parties/types';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import {
  normalizeTransactionType,
  type Transaction,
} from '@/src/features/transactions/types';
import { formatDate } from '@/src/lib/format';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { Row } from '@/src/ui/v2/Row';
import { Text } from '@/src/ui/v2/Text';
import { inrCompact, inrFull, useThemeV2 } from '@/src/theme/v2';

/**
 * Party-type tone (hero avatar + type pill).
 *
 * Color discipline: party types (client / vendor / contractor / labour …) are
 * categorical labels. They all use a neutral tone (fill3 + secondary). Color
 * is reserved for things that carry meaning — the opening-balance card below
 * still goes red/green based on direction (you owe vs they owe), and action
 * buttons (call / WhatsApp) keep their semantic blue/green.
 *
 * Returns a palette-shaped object so consuming JSX (`tone.soft`, `tone.base`)
 * doesn't need branching.
 */
function partyTypeTone(
  t: ReturnType<typeof useThemeV2>,
): { base: string; soft: string; softDark: string } {
  return {
    base: t.colors.secondary,
    soft: t.colors.fill3,
    softDark: t.colors.fill3,
  };
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

function formatPaymentMethod(m: string): string {
  return m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Compact inline action icon — used on the right edge of the party hero
 * card, beside the name. Just a small blue-tinted circle with the icon;
 * no text label, since the glyphs (call / WhatsApp logo / envelope) are
 * universally recognised. Generous hitSlop keeps the tap target finger-
 * friendly even though the visible button is only 32×32.
 */
function InlineActionBtn({
  icon,
  onPress,
  t,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  t: ReturnType<typeof useThemeV2>;
  accessibilityLabel: string;
}) {
  // Per the brand-colour decision: WhatsApp keeps its green identity, every
  // other comms action (Call / Email / SMS) reads in interactive blue. The
  // icon name is the discriminator.
  const isWhatsApp = icon === 'logo-whatsapp';
  const tone = isWhatsApp ? t.palette.green : t.palette.blue;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.inlineActionBtn,
        {
          backgroundColor:
            t.mode === 'dark' ? tone.softDark : tone.soft,
        },
        pressed && { opacity: 0.7, transform: [{ scale: 0.92 }] },
      ]}
    >
      <Ionicons name={icon} size={16} color={tone.base} />
    </Pressable>
  );
}

export default function PartyDetailScreen() {
  const t = useThemeV2();
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

  // Filter the project's transactions down to this party.
  const partyTxns = useMemo(
    () => allProjectTxns.filter((tx) => tx.partyId === partyId),
    [allProjectTxns, partyId],
  );

  const partyTotals = useMemo(() => {
    let received = 0;
    let paid = 0;
    for (const tx of partyTxns) {
      const type = normalizeTransactionType(tx.type);
      if (type === 'payment_in') received += tx.amount;
      else paid += tx.amount;
    }
    return { received, paid, net: received - paid };
  }, [partyTxns]);

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)' as never);
  };

  if (loading && !party) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <ScreenHeader t={t} onBack={onBack} />
        <View style={styles.center}>
          <Text variant="callout" color="secondary">
            Loading…
          </Text>
        </View>
      </View>
    );
  }

  if (!party) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <ScreenHeader t={t} onBack={onBack} />
        <View style={styles.center}>
          <Text variant="callout" color="secondary">
            Party not found
          </Text>
        </View>
      </View>
    );
  }

  const tone = partyTypeTone(t);
  const typeKey = (party.partyType ?? party.role) as PartyType | undefined;
  const typeLabel = typeKey ? getPartyTypeLabel(typeKey) : '—';
  const initial = party.name.charAt(0).toUpperCase();
  const openingBalance = party.openingBalance ?? 0;
  const isToReceive = party.openingBalanceType === 'to_receive';
  // 90/10 discipline: positive (to-receive) renders in neutral grey; only
  // the problem state (to-pay i.e. studio owes the party) keeps red.
  // We still hand a palette-shaped object to the JSX below so the existing
  // `.soft / .softDark / .base` accessors keep working without branching.
  const balanceTone = isToReceive
    ? {
        soft: t.colors.fill3,
        softDark: t.colors.fill3,
        base: t.colors.secondary,
      }
    : t.palette.red;
  const bank = party.bankDetails;
  const hasBank =
    !!bank &&
    !!(bank.accountNumber || bank.ifsc || bank.bankName || bank.upiId || bank.accountHolderName);
  const hasContactDetail =
    !!party.email || !!party.fatherName || !!party.dateOfJoining || !!party.address;

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* Header — transparent so the AmbientBackground flows through */}
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: t.colors.fill3, borderRadius: 999 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={t.colors.label} />
        </Pressable>
        <Text variant="headline" color="label" style={styles.headerTitle}>
          Party
        </Text>
        <Pressable
          onPress={() =>
            router.push(`/(app)/add-party?partyId=${party.id}` as never)
          }
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor:
                t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
              borderRadius: 999,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="create-outline" size={16} color={t.palette.blue.base} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity hero */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <View
            style={[
              styles.heroCard,
              {
                backgroundColor: cardBg,
                borderRadius: t.radii.card,
                borderColor: cardBorder,
                borderWidth: t.hairline,
              },
            ]}
          >
            {/* Single-row card: avatar · name+type · inline action icons.
                Same pattern as a Messages chat row or iOS Mail thread row —
                everything you need to know about this party in one band, no
                wasted vertical space. Action icons drop their text labels
                because the glyphs (call / WhatsApp logo / envelope) are
                universally recognised. */}
            <View style={styles.identityRow}>
              <View
                style={[
                  styles.heroAvatar,
                  {
                    backgroundColor:
                      t.mode === 'dark' ? tone.softDark : tone.soft,
                    borderRadius: t.radii.tile,
                  },
                ]}
              >
                <Text
                  variant="headline"
                  style={{
                    color: tone.base,
                    fontWeight: '700',
                    letterSpacing: -0.2,
                  }}
                >
                  {initial}
                </Text>
              </View>

              <View style={styles.identityText}>
                <Text
                  variant="callout"
                  color="label"
                 
                  numberOfLines={2}
                >
                  {party.name}
                </Text>
                <Text
                  variant="caption1"
                  color="secondary"
                  numberOfLines={1}
                  style={{ marginTop: 2 }}
                >
                  {typeLabel}
                </Text>
              </View>

              {(party.phone || party.email) ? (
                <View style={styles.inlineActions}>
                  {party.phone ? (
                    <InlineActionBtn
                      icon="call"
                      onPress={() => Linking.openURL(`tel:${party.phone}`)}
                      t={t}
                      accessibilityLabel="Call"
                    />
                  ) : null}
                  {party.phone ? (
                    <InlineActionBtn
                      icon="logo-whatsapp"
                      onPress={() =>
                        Linking.openURL(
                          `https://wa.me/${party.phone!.replace(/\D/g, '')}`,
                        )
                      }
                      t={t}
                      accessibilityLabel="WhatsApp"
                    />
                  ) : null}
                  {party.email ? (
                    <InlineActionBtn
                      icon="mail-outline"
                      onPress={() => Linking.openURL(`mailto:${party.email}`)}
                      t={t}
                      accessibilityLabel="Email"
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Opening balance */}
        {openingBalance > 0 ? (
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <View
              style={[
                styles.balanceCard,
                {
                  backgroundColor:
                    t.mode === 'dark' ? balanceTone.softDark : balanceTone.soft,
                  borderRadius: t.radii.card,
                  borderColor: balanceTone.base + '33',
                  borderWidth: t.hairline,
                },
              ]}
            >
              <View
                style={[
                  styles.balanceRail,
                  { backgroundColor: balanceTone.base },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text
                  variant="caption2"
                  style={{
                    color: balanceTone.base,
                    letterSpacing: 0.5,
                    fontWeight: '700',
                  }}
                >
                  OPENING BALANCE
                </Text>
                <Text
                  variant="title2"
                  style={{
                    color: balanceTone.base,
                    fontWeight: '700',
                    marginTop: 4,
                  }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {inrFull(openingBalance)}
                </Text>
                <Text
                  variant="caption1"
                  color="secondary"
                  style={{ marginTop: 2 }}
                >
                  {isToReceive
                    ? 'They owe you (To receive)'
                    : 'You owe them (To pay)'}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Contact */}
        <FormGroup header="Contact">
          <Row
            label="Phone"
            value={party.phone || '—'}
            valueColor={party.phone ? undefined : t.colors.tertiary}
            onPress={party.phone ? () => Linking.openURL(`tel:${party.phone}`) : undefined}
            divider={hasContactDetail}
          />
          {party.email ? (
            <Row
              label="Email"
              value={party.email}
              onPress={() => Linking.openURL(`mailto:${party.email}`)}
              divider={!!(party.fatherName || party.dateOfJoining || party.address)}
            />
          ) : null}
          {party.fatherName ? (
            <Row
              label="Father"
              value={party.fatherName}
              divider={!!(party.dateOfJoining || party.address)}
            />
          ) : null}
          {party.dateOfJoining ? (
            <Row
              label="Joined"
              value={formatDate(party.dateOfJoining.toDate())}
              divider={!!party.address}
            />
          ) : null}
          {party.address ? (
            <Row
              label="Address"
              subtitle={party.address}
              divider={false}
            />
          ) : null}
        </FormGroup>

        {/* KYC */}
        {party.aadharNumber || party.panNumber ? (
          <FormGroup header="KYC">
            {party.aadharNumber ? (
              <Row
                label="Aadhar"
                value={maskAadhar(party.aadharNumber)}
                divider={!!party.panNumber}
              />
            ) : null}
            {party.panNumber ? (
              <Row label="PAN" value={party.panNumber} divider={false} />
            ) : null}
          </FormGroup>
        ) : null}

        {/* Bank */}
        {hasBank && bank ? (
          <FormGroup header="Bank">
            {bank.accountHolderName ? (
              <Row
                label="Holder"
                value={bank.accountHolderName}
                divider={!!(bank.bankName || bank.accountNumber || bank.ifsc || bank.upiId)}
              />
            ) : null}
            {bank.bankName ? (
              <Row
                label="Bank"
                value={bank.bankName}
                divider={!!(bank.accountNumber || bank.ifsc || bank.upiId)}
              />
            ) : null}
            {bank.accountNumber ? (
              <Row
                label="A/c"
                value={maskAccount(bank.accountNumber)}
                divider={!!(bank.ifsc || bank.upiId)}
              />
            ) : null}
            {bank.ifsc ? (
              <Row
                label="IFSC"
                value={bank.ifsc}
                divider={!!bank.upiId}
              />
            ) : null}
            {bank.upiId ? (
              <Row label="UPI" value={bank.upiId} divider={false} />
            ) : null}
          </FormGroup>
        ) : null}

        {/* Project-scoped transactions */}
        {projectIdValue ? (
          <View style={{ marginTop: 24 }}>
            <View style={styles.txnHeader}>
              <Text
                variant="caption2"
                color="secondary"
                style={{ letterSpacing: 0.4 }}
              >
                TRANSACTIONS
              </Text>
              <Text variant="caption2" color="tertiary">
                {partyTxns.length}
              </Text>
            </View>

            {partyTxns.length > 0 ? (
              <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
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
                  <TxnSummary totals={partyTotals} t={t} />
                </View>
              </View>
            ) : null}

            <View
              style={[
                styles.txnsCard,
                {
                  backgroundColor: cardBg,
                  borderRadius: t.radii.group,
                  borderColor: cardBorder,
                  borderWidth: t.hairline,
                },
              ]}
            >
              {partyTxns.length === 0 ? (
                <View style={styles.txnEmpty}>
                  <Ionicons
                    name="receipt-outline"
                    size={24}
                    color={t.colors.tertiary}
                  />
                  <Text
                    variant="callout"
                    color="secondary"
                    style={{ marginTop: 8, textAlign: 'center' }}
                  >
                    No transactions yet
                  </Text>
                  <Text
                    variant="caption1"
                    color="tertiary"
                    style={{ marginTop: 4, textAlign: 'center' }}
                  >
                    Logged payments with this party on this project show here
                  </Text>
                </View>
              ) : (
                partyTxns.map((tx, i) => (
                  <PartyTxnRow
                    key={tx.id}
                    txn={tx}
                    divider={i < partyTxns.length - 1}
                    onPress={() =>
                      router.push(
                        `/(app)/projects/${projectIdValue}/transaction/${tx.id}` as never,
                      )
                    }
                  />
                ))
              )}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ScreenHeader({
  t,
  onBack,
}: {
  t: ReturnType<typeof useThemeV2>;
  onBack: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        hitSlop={10}
        style={({ pressed }) => [
          styles.iconBtn,
          { backgroundColor: t.colors.fill3, borderRadius: 999 },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Ionicons name="chevron-back" size={18} color={t.colors.label} />
      </Pressable>
      <Text variant="headline" color="label" style={styles.headerTitle}>
        Party
      </Text>
      <View style={styles.iconBtn} />
    </View>
  );
}

function TxnSummary({
  totals,
  t,
}: {
  totals: { received: number; paid: number; net: number };
  t: ReturnType<typeof useThemeV2>;
}) {
  if (totals.received === 0 && totals.paid === 0) {
    return (
      <Text variant="callout" color="secondary">
        —
      </Text>
    );
  }
  // 90/10 discipline: amounts render in neutral label colour. The labels
  // (RECEIVED / PAID) and +/− signs carry the direction. Only the NET
  // value flips red when it's negative (an actual problem).
  if (totals.received > 0 && totals.paid === 0) {
    return (
      <SingleSummary
        label="RECEIVED"
        value={inrCompact(totals.received)}
        color={t.colors.label}
      />
    );
  }
  if (totals.paid > 0 && totals.received === 0) {
    return (
      <SingleSummary
        label="PAID"
        value={inrCompact(totals.paid)}
        color={t.colors.label}
      />
    );
  }
  // Mixed — Net + Paid + Received columns
  const netColor = totals.net < 0 ? t.palette.red.base : t.colors.label;
  const netSign = totals.net > 0 ? '+' : totals.net < 0 ? '−' : '';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <SummaryCol
        label="NET"
        value={`${netSign}${inrCompact(Math.abs(totals.net))}`}
        color={netColor}
      />
      <View style={[styles.summaryDivider, { backgroundColor: t.colors.separator }]} />
      <SummaryCol
        label="RECEIVED"
        value={inrCompact(totals.received)}
        color={t.colors.label}
      />
      <View style={[styles.summaryDivider, { backgroundColor: t.colors.separator }]} />
      <SummaryCol
        label="PAID"
        value={inrCompact(totals.paid)}
        color={t.colors.label}
      />
    </View>
  );
}

function SingleSummary({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View>
      <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.4 }}>
        {label}
      </Text>
      <Text
        variant="title2"
        style={{ color, marginTop: 4, fontWeight: '700' }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function SummaryCol({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.summaryCol}>
      <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.4 }}>
        {label}
      </Text>
      <Text
        variant="callout"
        style={{ color, marginTop: 4, fontWeight: '700' }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function PartyTxnRow({
  txn,
  divider,
  onPress,
}: {
  txn: Transaction;
  divider: boolean;
  onPress: () => void;
}) {
  const t = useThemeV2();
  const type = normalizeTransactionType(txn.type);
  const isIn = type === 'payment_in';
  // 90/10 discipline: transaction rows render in neutral tones — like a
  // bank statement. The +/− prefix on the amount carries the direction.
  // Icon tile + glyph are always neutral; amount text is neutral too.
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
      style={({ pressed }) => [
        styles.txnRow,
        pressed && { backgroundColor: t.colors.fill3 },
      ]}
    >
      <View
        style={[
          styles.txnIcon,
          {
            backgroundColor: t.colors.fill3,
            borderRadius: t.radii.tile,
          },
        ]}
      >
        <Ionicons
          name={isIn ? 'arrow-down' : 'arrow-up'}
          size={14}
          color={t.colors.secondary}
        />
      </View>
      <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
        <Text variant="body" color="label" numberOfLines={1}>
          {txn.description || (isIn ? 'Payment received' : 'Payment made')}
        </Text>
        <Text
          variant="caption1"
          color="secondary"
          numberOfLines={1}
          style={{ marginTop: 2 }}
        >
          {meta}
        </Text>
      </View>
      <Text
        variant="callout"
        color="label"
        style={{ fontWeight: '600', marginLeft: 8, fontVariant: ['tabular-nums'] }}
      >
        {isIn ? '+' : '−'}
        {inrCompact(txn.amount)}
      </Text>

      {divider ? (
        <View
          style={[
            styles.rowDivider,
            { backgroundColor: t.colors.separator, left: 60 },
          ]}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    gap: 10,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontWeight: '600' },

  // Hero — single-row card: avatar · name+type · inline action icons
  heroCard: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroAvatar: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  inlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  inlineActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Balance card
  balanceCard: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    overflow: 'hidden',
  },
  balanceRail: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: 12,
  },

  // Transactions
  txnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 7,
  },
  summaryCard: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 8,
  },

  txnsCard: {
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  txnEmpty: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
    position: 'relative',
  },
  txnIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDivider: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    height: 0.5,
  },
});
