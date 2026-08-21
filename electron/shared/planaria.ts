export const PLANARIA_CHANNELS = {
  getDashboard: 'planaria:get-dashboard',
  getPublicBillboards: 'planaria:get-public-billboards',
  selectFile: 'planaria:select-file',
  selectTargetPath: 'planaria:select-target-path',
  saveDraft: 'planaria:save-draft',
  uploadPackage: 'planaria:upload-package',
  uploadModMedia: 'planaria:upload-mod-media',
  uploadBillboard: 'planaria:upload-billboard',
  transitionVersion: 'planaria:transition-version',
  mutateBillboard: 'planaria:mutate-billboard',
  createAdmin: 'planaria:create-admin',
  uploadProgress: 'planaria:upload-progress',
} as const;

export type PlanariaInvokeChannel = (typeof PLANARIA_CHANNELS)[keyof Omit<typeof PLANARIA_CHANNELS, 'uploadProgress'>];
export type PlanariaPublishState = 'draft' | 'ready' | 'published' | 'disabled';
export type PlanariaFilePurpose = 'mod-package' | 'mod-image' | 'billboard';

export interface PlanariaAccess { readonly role: 'admin' | 'super_admin'; readonly canManageAdmins: boolean }
export interface PlanariaStats {
  readonly totalMods: number; readonly publishedMods: number; readonly completedDownloads: number;
  readonly activeBillboards: number; readonly adminAccounts: number;
}
export interface PlanariaGame { readonly id: string; readonly edition: string; readonly displayName: string; readonly enabled: boolean }
export interface PlanariaMod {
  readonly id: string; readonly name: string; readonly summary: string; readonly gameId: string;
  readonly state: PlanariaPublishState; readonly createdAt: string; readonly updatedAt: string;
}
export interface PlanariaModVersion {
  readonly id: string; readonly modId: string; readonly version: string; readonly gameEdition: string;
  readonly gameVersionRange: string | null; readonly manifestSchemaVersion: 1 | 2;
  readonly manifest: Readonly<Record<string, unknown>>; readonly adapterId: string;
  readonly state: PlanariaPublishState; readonly publishedAt: string | null;
  readonly createdAt: string; readonly updatedAt: string;
}
export interface PlanariaPackage {
  readonly versionId: string; readonly byteSize: number; readonly sha256: string; readonly verifiedAt: string | null;
}
export interface PlanariaMedia {
  readonly id: string; readonly modId: string; readonly mimeType: string; readonly byteSize: number;
  readonly width: number; readonly height: number; readonly displayOrder: number;
  readonly createdAt: string; readonly previewUrl: string | null;
}
export interface PlanariaBillboard {
  readonly id: string; readonly kind: 'image' | 'video'; readonly mimeType: string; readonly byteSize: number;
  readonly width: number; readonly height: number; readonly durationMs: number | null; readonly alt: string;
  readonly displayOrder: number; readonly state: 'draft' | 'published' | 'disabled'; readonly revision: number;
  readonly createdAt: string; readonly updatedAt: string; readonly publishedAt: string | null;
  readonly previewUrl: string | null;
}
export interface PlanariaAdminAccount {
  readonly id: string; readonly email: string; readonly username: string | null;
  readonly role: 'admin' | 'super_admin'; readonly canManageAdmins: boolean;
  readonly createdAt: string; readonly lastSignInAt: string | null;
}
export interface PlanariaActivity {
  readonly id: string; readonly action: string; readonly entityType: string;
  readonly entityId: string | null; readonly summary: string; readonly createdAt: string;
}
export interface PlanariaDashboardSnapshot {
  readonly access: PlanariaAccess; readonly stats: PlanariaStats; readonly games: readonly PlanariaGame[];
  readonly mods: readonly PlanariaMod[]; readonly versions: readonly PlanariaModVersion[];
  readonly packages: readonly PlanariaPackage[]; readonly media: readonly PlanariaMedia[];
  readonly billboards: readonly PlanariaBillboard[]; readonly accounts: readonly PlanariaAdminAccount[];
  readonly recentActivity: readonly PlanariaActivity[];
}
export interface PublicBillboardItem {
  readonly id: string; readonly kind: 'image' | 'video'; readonly alt: string;
  readonly displayOrder: number; readonly published: true; readonly src: string;
}
export interface PlanariaFileSelection {
  readonly id: string; readonly purpose: PlanariaFilePurpose; readonly name: string;
  readonly mimeType: string; readonly size: number; readonly sha256: string;
}
export interface PlanariaTargetPathSelection { readonly relativePath: string }
export interface PlanariaSaveDraftInput {
  readonly modId: string; readonly name: string; readonly summary: string; readonly gameId: string;
  readonly versionId: string | null; readonly version: string; readonly gameEdition: string;
  readonly gameVersionRange: string | null; readonly manifestSchemaVersion: 1 | 2;
  readonly manifest: Readonly<Record<string, unknown>>; readonly adapterId: string;
  readonly expectedUpdatedAt: string | null;
}
export interface PlanariaSaveDraftResult {
  readonly versionId: string; readonly modUpdatedAt: string; readonly versionUpdatedAt: string;
}
export interface PlanariaPackageUploadInput {
  readonly selectionId: string; readonly versionId: string; readonly modId: string; readonly version: string;
}
export interface PlanariaModMediaUploadInput { readonly selectionId: string; readonly modId: string }
export interface PlanariaBillboardUploadInput { readonly selectionId: string; readonly alt: string }
export interface PlanariaTransitionInput {
  readonly action: 'ready' | 'publish' | 'disable'; readonly versionId: string; readonly expectedUpdatedAt: string;
}
export interface PlanariaBillboardMutationInput {
  readonly action: 'move' | 'publish' | 'disable' | 'delete'; readonly billboardId: string;
  readonly expectedRevision?: number; readonly direction?: -1 | 1;
}
export interface PlanariaCreateAdminInput { readonly email: string; readonly username: string; readonly password: string }
export interface PlanariaUploadProgress {
  readonly uploadId: string; readonly purpose: PlanariaFilePurpose;
  readonly status: 'preparing' | 'uploading' | 'finalizing' | 'success' | 'error';
  readonly percent: number; readonly transferred: number; readonly total: number; readonly error: string | null;
}

export interface LyorPlanariaApi {
  readonly getDashboard: () => Promise<PlanariaDashboardSnapshot>;
  readonly getPublicBillboards: () => Promise<readonly PublicBillboardItem[]>;
  readonly selectFile: (purpose: PlanariaFilePurpose) => Promise<PlanariaFileSelection | null>;
  readonly selectTargetPath: () => Promise<PlanariaTargetPathSelection | null>;
  readonly saveDraft: (input: PlanariaSaveDraftInput) => Promise<PlanariaSaveDraftResult>;
  readonly uploadPackage: (input: PlanariaPackageUploadInput) => Promise<void>;
  readonly uploadModMedia: (input: PlanariaModMediaUploadInput) => Promise<void>;
  readonly uploadBillboard: (input: PlanariaBillboardUploadInput) => Promise<void>;
  readonly transitionVersion: (input: PlanariaTransitionInput) => Promise<void>;
  readonly mutateBillboard: (input: PlanariaBillboardMutationInput) => Promise<void>;
  readonly createAdmin: (input: PlanariaCreateAdminInput) => Promise<void>;
  readonly onUploadProgress: (listener: (progress: PlanariaUploadProgress) => void) => () => void;
}
