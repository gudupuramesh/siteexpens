/**
 * Toolkit tab — utility calculators and references for designers
 * working on-site. Implementation in `src/features/toolkit/`.
 *
 * Studio switcher chip is inlined into ToolkitHome's hero (top-right
 * of the eyebrow row) so it shares the same visual line as the
 * "SITEEXPENS · TOOLKIT" label — no empty header strip on top.
 */
import { ToolkitHome } from '@/src/features/toolkit/ToolkitHome';
import { Screen } from '@/src/ui/Screen';

export default function ToolkitTab() {
  return (
    <Screen padded={false}>
      <ToolkitHome />
    </Screen>
  );
}
