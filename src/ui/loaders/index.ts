/**
 * Loader catalog — interior-design themed loading indicators.
 *
 * Each loader has a specific use site (see plan in
 * /Users/gudupuramesh/.claude/plans/stateless-singing-fairy.md).
 * The default fallback is SwatchesLoader; reach for the others when
 * the context calls for a more on-brand cue.
 *
 * Theming: each loader accepts an optional `tint` prop. Defaults are
 * pulled from the app's color tokens — no need to override unless the
 * surrounding context calls for a colour shift (e.g. on a colored
 * card background).
 */
export { SwatchesLoader } from './SwatchesLoader';
export { BlueprintLoader } from './BlueprintLoader';
export { IsometricLoader } from './IsometricLoader';
