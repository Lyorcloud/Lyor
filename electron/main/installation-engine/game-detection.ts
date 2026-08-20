import type { GameStore, VerifiedGameInstallation } from '../../shared/installation-engine';

export interface GameDetectionProvider {
  readonly store: GameStore;
  detect(): Promise<readonly VerifiedGameInstallation[]>;
}

export class GameDetectionRegistry {
  readonly #detections = new Map<string, VerifiedGameInstallation>();

  register(detection: VerifiedGameInstallation): void {
    if (!detection.verified) return;
    this.#detections.set(detection.detectionId, Object.freeze({ ...detection }));
  }

  async discover(providers: readonly GameDetectionProvider[]): Promise<readonly VerifiedGameInstallation[]> {
    const results = await Promise.all(providers.map(async (provider) => provider.detect()));
    for (const providerResults of results) {
      for (const detection of providerResults) this.register(detection);
    }
    return this.list();
  }

  get(detectionId: string): VerifiedGameInstallation | null {
    return this.#detections.get(detectionId) ?? null;
  }

  list(): readonly VerifiedGameInstallation[] {
    return [...this.#detections.values()];
  }
}

export const GAME_DETECTION_PROVIDERS: readonly GameStore[] = [
  'steam', 'epic', 'rockstar', 'xbox', 'manual',
];
