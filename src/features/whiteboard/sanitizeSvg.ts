/**
 * Sanitize an SVG XML string before passing it to `react-native-svg`.
 *
 * Why: react-native-svg's iOS native renderer (`RNSVGSvgView
 * defineMask:maskName:`) crashes with `NSInvalidArgumentException:
 * key cannot be nil` when an SVG contains a `<mask>` element without
 * an `id` attribute. Excalidraw-generated SVG snapshots (which we
 * persist to `whiteboards/{id}.thumbnailSvg`) commonly include such
 * anonymous mask elements for clipping operations. The result is a
 * hard crash of the entire app on iOS the moment the snapshot
 * renders. Android's renderer is more lenient and ignores the issue
 * silently.
 *
 * This helper does TWO defensive passes:
 *   1. **Add IDs to anonymous masks.** Any `<mask>` (or `<clipPath>`,
 *      `<filter>`, `<linearGradient>`, `<radialGradient>`, `<pattern>`,
 *      `<symbol>`) that's missing an `id` attribute gets one synthesized
 *      from a counter. Reference targets (`fill="url(#…)"`,
 *      `mask="url(#…)"`, etc.) are left as-is — they were already
 *      pointing at named elements; we don't break those.
 *   2. **Drop unsupported elements** (currently `<foreignObject>`,
 *      which is used by Excalidraw for HTML-in-SVG and is not
 *      supported by react-native-svg at all).
 *
 * Performance: regex-based; SVGs from Excalidraw are typically <50KB,
 * so the cost is negligible. We do NOT parse to a DOM (no DOM API on
 * RN); the regex is conservative — it only matches actual element
 * open tags, not occurrences inside attribute values.
 */

/** Element types whose `id` attribute is required by react-native-svg's
 *  reference-resolution code. Any of these without an `id` will crash
 *  on iOS. */
const ID_REQUIRED_ELEMENTS = [
  'mask',
  'clipPath',
  'filter',
  'linearGradient',
  'radialGradient',
  'pattern',
  'symbol',
] as const;

/** Regex matching the open tag of an ID-required element. We accept
 *  `<mask>`, `<mask attrs>`, `<mask attrs/>`. Group 1 captures the
 *  full attributes section (including leading whitespace) so we can
 *  inspect / extend it. */
const ID_REQUIRED_OPEN_TAG_RE = new RegExp(
  `<(${ID_REQUIRED_ELEMENTS.join('|')})((?:\\s[^>]*)?)(/?)>`,
  'gi',
);

/** Detects an existing `id="..."` attribute (or `id='...'`). */
const HAS_ID_RE = /\s+id\s*=\s*["'][^"']*["']/i;

/**
 * Make every `<mask>` / `<clipPath>` / etc element have an `id`
 * attribute. Returns the sanitized XML.
 */
export function sanitizeSvgXml(xml: string): string {
  if (!xml || typeof xml !== 'string') return xml;

  let counter = 0;
  let sanitized = xml.replace(
    ID_REQUIRED_OPEN_TAG_RE,
    (_match, tagName: string, attrs: string, selfClose: string) => {
      if (HAS_ID_RE.test(attrs)) {
        // Already has an id — leave it alone.
        return `<${tagName}${attrs}${selfClose}>`;
      }
      counter += 1;
      const synthId = `__sanitized_${tagName.toLowerCase()}_${counter}`;
      // Insert the id right after the tag name, before any other
      // attributes. Keep the original attrs + self-close intact.
      return `<${tagName} id="${synthId}"${attrs}${selfClose}>`;
    },
  );

  // Drop <foreignObject> entirely — react-native-svg doesn't support
  // HTML-in-SVG and Excalidraw uses these for free-text labels. We'd
  // rather miss the label than crash.
  sanitized = sanitized.replace(
    /<foreignObject\b[\s\S]*?<\/foreignObject>/gi,
    '',
  );
  // Self-closing variant (rare but possible).
  sanitized = sanitized.replace(/<foreignObject\b[^>]*\/>/gi, '');

  return sanitized;
}

/** True when the SVG has at least one element that would have crashed
 *  before sanitization. Useful for telemetry / debugging. */
export function hadAnonymousReferenceElements(xml: string): boolean {
  if (!xml || typeof xml !== 'string') return false;
  let found = false;
  xml.replace(ID_REQUIRED_OPEN_TAG_RE, (_m, _tag, attrs: string) => {
    if (!HAS_ID_RE.test(attrs)) found = true;
    return _m;
  });
  return found;
}
