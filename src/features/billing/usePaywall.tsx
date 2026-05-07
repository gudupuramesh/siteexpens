/**
 * `usePaywall` + `<PaywallProvider/>` — singleton paywall state so any
 * screen can imperatively open the limit-reached sheet without having
 * to mount its own Modal locally.
 *
 * Usage:
 *   1. Mount `<PaywallProvider/>` once near the root (inside
 *      `<AuthProvider/>` so it has access to the active org's
 *      subscription).
 *   2. In any screen / hook:
 *        const { openPaywall } = usePaywall();
 *        try {
 *          await createProject(...)
 *        } catch (err) {
 *          if (err instanceof PlanLimitError) {
 *            openPaywall({ reason: err.reason as any });
 *          }
 *        }
 *
 * Why a context (not a global): keeps the sheet owned by React,
 * easier to test, plays nicely with multiple stack screens (the
 * sheet always overlays whatever is on top).
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { PaywallSheet, type PaywallReason } from './PaywallSheet';
import { useSubscription } from './useSubscription';

type OpenArgs = {
  reason: PaywallReason;
  /** Optional override of the auto-generated headline. */
  headline?: string;
};

type PaywallContextValue = {
  openPaywall: (args: OpenArgs) => void;
  closePaywall: () => void;
  isOpen: boolean;
};

const PaywallContext = createContext<PaywallContextValue>({
  openPaywall: () => {},
  closePaywall: () => {},
  isOpen: false,
});

export function PaywallProvider({ children }: { children: ReactNode }) {
  const { effectiveTier } = useSubscription();
  const [state, setState] = useState<OpenArgs | null>(null);

  const openPaywall = useCallback((args: OpenArgs) => {
    setState(args);
  }, []);

  const closePaywall = useCallback(() => {
    setState(null);
  }, []);

  const value = useMemo<PaywallContextValue>(
    () => ({ openPaywall, closePaywall, isOpen: state !== null }),
    [openPaywall, closePaywall, state],
  );

  return (
    <PaywallContext.Provider value={value}>
      {children}
      <PaywallSheet
        visible={state !== null}
        onClose={closePaywall}
        currentTier={effectiveTier}
        reason={state?.reason ?? 'browse'}
        headline={state?.headline}
      />
    </PaywallContext.Provider>
  );
}

export function usePaywall(): PaywallContextValue {
  return useContext(PaywallContext);
}
