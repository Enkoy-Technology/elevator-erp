'use client';

import { useSyncExternalStore } from 'react';

type SidebarState = { collapsed: boolean; hidden: boolean };

const KEY = 'sidebar-state';
const SERVER: SidebarState = { collapsed: false, hidden: false };

let state: SidebarState = SERVER;
let loaded = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode) — in-memory state still works
  }
};

const subscribe = (cb: () => void) => {
  if (!loaded) {
    loaded = true;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = { ...state, ...(JSON.parse(raw) as Partial<SidebarState>) };
    } catch {
      // ignore malformed / unavailable storage
    }
    if (state !== SERVER) emit();
  }
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export const useSidebarState = (): SidebarState =>
  useSyncExternalStore(subscribe, () => state, () => SERVER);

export const toggleCollapsed = () => {
  state = { ...state, collapsed: !state.collapsed };
  persist();
  emit();
};

export const toggleHidden = () => {
  state = { ...state, hidden: !state.hidden };
  persist();
  emit();
};
