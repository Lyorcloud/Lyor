import { useSyncExternalStore } from 'react';

import {
  getMockInstallPhases,
  getMockModState,
  subscribeToMockInstallPhases,
  subscribeToMockModState,
} from '../services/mockModService';
import type { MockInstallPhase, MockModState, ModId } from '../types/domain';

/** React binding for the renderer-only persisted mock install/favorite state. */
export function useMockModState(): MockModState {
  return useSyncExternalStore(
    subscribeToMockModState,
    getMockModState,
    getMockModState,
  );
}

export function useMockInstallPhases(): ReadonlyMap<ModId, MockInstallPhase> {
  return useSyncExternalStore(subscribeToMockInstallPhases, getMockInstallPhases, getMockInstallPhases);
}
