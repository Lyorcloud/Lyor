export type PublishState = 'draft' | 'ready' | 'published' | 'disabled';

export interface VersionDraft {
  readonly id: string;
  readonly state: PublishState;
  readonly revision: number;
  readonly packageVerified: boolean;
  readonly manifestValidated: boolean;
  readonly adapterCompatible: boolean;
}

const TRANSITIONS: Readonly<Record<PublishState, readonly PublishState[]>> = {
  draft: ['ready'],
  ready: ['draft', 'published'],
  published: ['disabled'],
  disabled: [],
};

export const transitionVersion = (draft: VersionDraft, target: PublishState, expectedRevision: number): VersionDraft => {
  if (draft.revision !== expectedRevision) throw new Error('Concurrent lifecycle update rejected.');
  if (!TRANSITIONS[draft.state].includes(target)) throw new Error('Invalid lifecycle transition.');
  if (target === 'ready' && (!draft.packageVerified || !draft.manifestValidated || !draft.adapterCompatible)) {
    throw new Error('Package, manifest, and adapter validation must pass before Ready.');
  }
  if (target === 'published' && draft.state !== 'ready') throw new Error('Only Ready versions can be published.');
  return { ...draft, state: target, revision: draft.revision + 1 };
};

export const assertAdmin = (role: 'user' | 'admin' | 'super_admin'): void => {
  if (role !== 'admin' && role !== 'super_admin') throw new Error('Planaria admin authorization required.');
};

export const assertEntitledPublishedDownload = (input: {
  readonly authenticated: boolean;
  readonly entitled: boolean;
  readonly state: PublishState;
}): void => {
  if (!input.authenticated || !input.entitled || input.state !== 'published') {
    throw new Error('Download authorization rejected.');
  }
};

export const acceptAnalyticsEvent = (
  eventName: string,
  serverVerified: boolean,
  seenKeys: Set<string>,
  idempotencyKey: string,
): boolean => {
  const allowed = new Set(['download_requested', 'download_started', 'download_completed', 'download_failed', 'install_completed', 'favorite']);
  if (!allowed.has(eventName) || seenKeys.has(idempotencyKey)) return false;
  if (eventName === 'download_completed' && !serverVerified) return false;
  seenKeys.add(idempotencyKey);
  return true;
};
