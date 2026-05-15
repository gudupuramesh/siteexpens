/**
 * v2 corner radii — DESIGN.md §2.4 (concentric).
 * Used by every v2 component; never inline a radius value in a screen.
 */

export const radii = {
  tabbar: 30,   // floating tab bar capsule
  sheet: 14,    // modal sheet top corners
  hero: 22,     // budget / transaction hero card
  group: 18,    // form groups, list containers
  card: 16,     // metric tiles, lead cards
  chip: 14,     // category tile
  field: 12,    // search, input, segmented
  tile: 10,     // icon tile
  pill: 999,    // status pill, filter chip
  dot: 3,       // status dot
} as const;
