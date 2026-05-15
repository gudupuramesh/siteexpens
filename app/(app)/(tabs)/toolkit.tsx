/**
 * Toolkit tab — utility calculators and references for designers
 * working on-site. Implementation in `src/features/toolkit/`.
 *
 * `ToolkitHome` is a self-contained v2 screen (renders its own
 * `<AmbientBackground/>`, header, and FormGroup-based tool list).
 * The tab file just mounts it.
 */
import { ToolkitHome } from '@/src/features/toolkit/ToolkitHome';

export default function ToolkitTab() {
  return <ToolkitHome />;
}
