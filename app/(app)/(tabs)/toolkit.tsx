/**
 * Toolkit tab — utility calculators and references for designers
 * working on-site. Implementation in `src/features/toolkit/`.
 */
import { Screen } from '@/src/ui/Screen';
import { ToolkitHome } from '@/src/features/toolkit/ToolkitHome';

export default function ToolkitTab() {
  return (
    <Screen padded={false}>
      <ToolkitHome />
    </Screen>
  );
}
