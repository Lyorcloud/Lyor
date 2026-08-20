import { useSyncExternalStore } from 'react';

import {
  getMockModState,
  subscribeToMockModState,
} from '../services/mockModService';
import type { MockModState } from '../types/domain';

/** React binding for the renderer-only persisted mock install/favorite state. */
export function useMockModState(): MockModState {
  return useSyncExternalStore(
    subscribeToMockModState,
    getMockModState,
    getMockModState,
  );
}
