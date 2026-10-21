import { useEffect, useState } from 'react';
import type { ScopeSettings } from '../instruments/oscilloscope';

/** Oscilloscope front-panel settings are display state, remembered per experiment on this device. */
const key = (experimentId: string) => `epu-lab.scopes.${experimentId}`;
function load(experimentId: string): Record<string, ScopeSettings> {
  try {
    const raw = JSON.parse(localStorage.getItem(key(experimentId)) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}
export function useScopeSettings(experimentId: string) {
  const [state, setState] = useState(() => ({ experimentId, scopes: load(experimentId) }));
  const scopes = state.experimentId === experimentId ? state.scopes : load(experimentId);
  useEffect(() => {
    try {
      localStorage.setItem(key(experimentId), JSON.stringify(scopes));
    } catch {
      /* Remembering scope settings is optional. */
    }
  }, [experimentId, scopes]);
  const set = (next: Record<string, ScopeSettings>) => setState({ experimentId, scopes: next });
  return [scopes, set] as const;
}
