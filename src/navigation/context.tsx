import { createContext, useContext } from 'react';
import type { Href } from 'expo-router';

export type ShellNavigation = {
  navigate: (href: Href, isCurrent?: () => boolean) => void;
  registerLeaveGuard: (guard: (proceed: () => void) => void) => () => void;
  registerBackHandler: (handler: () => boolean) => () => void;
};
export const ShellNavigationContext = createContext<ShellNavigation | null>(null);
export const useShellNavigation = () => useContext(ShellNavigationContext);
