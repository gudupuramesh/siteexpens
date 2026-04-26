import { memo, useMemo, type RefObject } from 'react';
import { FlatList, Pressable, StyleSheet, View, type ListRenderItemInfo } from 'react-native';

import { color, screenInset } from '@/src/theme';
import { Text } from '@/src/ui/Text';

const CHIP_WIDTH = 56;
const CHIP_GAP = 8;
export const CHIP_STRIDE = CHIP_WIDTH + CHIP_GAP;

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type DateChipProps = {
  date: Date;
  dateKey: string;
  active: boolean;
  disabled: boolean;
  todayKey: string;
  onSelect: (date: Date) => void;
};

const DateChip = memo(function DateChip({
  date,
  dateKey,
  active,
  disabled,
  todayKey,
  onSelect,
}: DateChipProps) {
  const day = useMemo(
    () => date.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase(),
    [date],
  );
  const countLabel = useMemo(
    () =>
      dateKey === todayKey
        ? 'TODAY'
        : date.toLocaleDateString('en-IN', { month: 'numeric', day: 'numeric' }),
    [date, dateKey, todayKey],
  );

  return (
    <Pressable
      disabled={disabled}
      onPress={() => onSelect(date)}
      style={[
        styles.dateChip,
        active && styles.dateChipActive,
        disabled && styles.dateChipDisabled,
      ]}
    >
      <Text variant="caption" style={[styles.dateChipDay, active ? styles.dateChipDayActive : undefined]}>
        {day}
      </Text>
      <Text variant="bodyStrong" style={[styles.dateChipNum, active ? styles.dateChipNumActive : undefined]}>
        {date.getDate()}
      </Text>
      <Text
        variant="caption"
        style={[styles.dateChipCount, active ? styles.dateChipCountActive : undefined]}
      >
        {countLabel}
      </Text>
    </Pressable>
  );
}, (prev, next) => (
  prev.dateKey === next.dateKey
  && prev.active === next.active
  && prev.disabled === next.disabled
  && prev.todayKey === next.todayKey
));

export type DateStripProps = {
  dates: Date[];
  selectedKey: string;
  todayKey: string;
  onSelect: (date: Date) => void;
  onTouchStart: () => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
  onScrollBeginDrag: () => void;
  onScrollEndDrag: () => void;
  onMomentumScrollEnd: () => void;
  onScrollXChange: (x: number) => void;
  listRef: RefObject<FlatList<Date> | null>;
};

export const DateStrip = memo(function DateStrip({
  dates,
  selectedKey,
  todayKey,
  onSelect,
  onTouchStart,
  onTouchEnd,
  onTouchCancel,
  onScrollBeginDrag,
  onScrollEndDrag,
  onMomentumScrollEnd,
  onScrollXChange,
  listRef,
}: DateStripProps) {
  const renderDateChip = ({ item }: ListRenderItemInfo<Date>) => {
    const key = toDateString(item);
    return (
      <DateChip
        date={item}
        dateKey={key}
        active={key === selectedKey}
        disabled={key > todayKey}
        todayKey={todayKey}
        onSelect={onSelect}
      />
    );
  };

  return (
    <View style={styles.dateRailWrap}>
      <FlatList
        ref={listRef}
        data={dates}
        horizontal
        keyExtractor={(item) => toDateString(item)}
        renderItem={renderDateChip}
        getItemLayout={(_, index) => ({
          length: CHIP_STRIDE,
          offset: CHIP_STRIDE * index,
          index,
        })}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dateRail}
        directionalLockEnabled
        scrollEventThrottle={16}
        onScroll={(e) => {
          onScrollXChange(e.nativeEvent.contentOffset.x);
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollEnd={onMomentumScrollEnd}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  dateRailWrap: {
    height: 96,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: color.bgGrouped,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },
  dateRail: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
  },
  dateChip: {
    width: CHIP_WIDTH,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginRight: CHIP_GAP,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bgGrouped,
  },
  dateChipActive: {
    backgroundColor: color.text,
    borderColor: color.text,
  },
  dateChipDisabled: {
    opacity: 0.4,
  },
  dateChipDay: {
    color: color.textFaint,
    letterSpacing: 0.6,
  },
  dateChipDayActive: {
    color: 'rgba(255,255,255,0.7)',
  },
  dateChipNum: {
    marginTop: 2,
    color: color.text,
    fontSize: 17,
  },
  dateChipNumActive: {
    color: color.onPrimary,
  },
  dateChipCount: {
    marginTop: 2,
    color: color.textFaint,
    letterSpacing: 0.4,
  },
  dateChipCountActive: {
    color: 'rgba(255,255,255,0.75)',
  },
});
