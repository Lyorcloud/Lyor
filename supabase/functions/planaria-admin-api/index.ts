import {
  authenticate,
  boundedString,
  handleError,
  json,
  parseJsonObject,
  safeIdentifier,
  signerRequest,
  uuidString,
} from '../_shared/planaria.ts';

type Row = Record<string, unknown>;

const rows = (value: unknown): Row[] => Array.isArray(value)
  ? value.filter((item): item is Row => typeof item === 'object' && item !== null && !Array.isArray(item))
  : [];

const signedPreview = async (objectKey: unknown): Promise<string | null> => {
  if (!boundedString(objectKey, 1, 512)) return null;
  try {
    const signed = await signerRequest('/download/sign', { objectKey, expiresInSeconds: 300 });
    return boundedString(signed.url, 1, 4096) ? signed.url : null;
  } catch {
    return null;
  }
};

const snapshot = async (context: Awaited<ReturnType<typeof authenticate>>): Promise<Response> => {
  const [accessResult, gamesResult, modsResult, versionsResult, packagesResult, mediaResult,
    billboardsResult, metricsResult, auditResult] = await Promise.all([
    context.database.rpc('planaria_get_access', { subject: context.subject }),
    context.database.from('catalog_games').select('id,edition,display_name,enabled,updated_at').order('display_name'),
    context.database.from('catalog_mods').select('id,name,summary,game_id,publish_state,created_at,updated_at').order('updated_at', { ascending: false }),
    context.database.from('catalog_mod_versions').select('id,mod_id,version,game_edition,game_version_range,manifest_schema_version,manifest,adapter_id,publish_state,published_at,created_at,updated_at').order('updated_at', { ascending: false }),
    context.database.from('mod_package_objects').select('version_id,byte_size,sha256,verified_at'),
    context.database.from('catalog_mod_media').select('id,mod_id,object_key,mime_type,byte_size,width,height,display_order,created_at').order('display_order'),
    context.database.from('billboards').select('id,media_type,object_key,mime_type,byte_size,width,height,duration_ms,alt_text,display_order,publish_state,revision,created_at,updated_at,published_at').order('display_order'),
    context.database.from('mod_metrics').select('mod_id,completed_downloads,completed_installs,favorites'),
    context.database.rpc('planaria_recent_audit', { subject: context.subject, maximum_rows: 20 }),
  ]);
  const failed = [accessResult, gamesResult, modsResult, versionsResult, packagesResult,
    mediaResult, billboardsResult, metricsResult, auditResult].find((result) => result.error);
  if (failed?.error) throw new Error('request-failed');

  const access = rows(accessResult.data)[0];
  if (!access || !['admin', 'super_admin'].includes(String(access.role))) throw new Error('forbidden');
  const canManageAdmins = access.can_manage_admins === true;
  const accountsResult = canManageAdmins
    ? await context.database.rpc('planaria_list_admin_accounts', { subject: context.subject })
    : { data: [], error: null };
  if (accountsResult.error) throw new Error('request-failed');

  const media = await Promise.all(rows(mediaResult.data).map(async (item) => ({
    id: item.id, modId: item.mod_id, mimeType: item.mime_type, byteSize: item.byte_size,
    width: item.width, height: item.height, displayOrder: item.display_order,
    createdAt: item.created_at, previewUrl: await signedPreview(item.object_key),
  })));
  const billboards = await Promise.all(rows(billboardsResult.data).map(async (item) => ({
    id: item.id, kind: item.media_type, mimeType: item.mime_type, byteSize: item.byte_size,
    width: item.width, height: item.height, durationMs: item.duration_ms,
    alt: item.alt_text, displayOrder: item.display_order, state: item.publish_state,
    revision: item.revision, createdAt: item.created_at, updatedAt: item.updated_at,
    publishedAt: item.published_at, previewUrl: await signedPreview(item.object_key),
  })));
  const metrics = rows(metricsResult.data);
  const downloads = metrics.reduce((sum, item) => sum + Number(item.completed_downloads ?? 0), 0);
  const mods = rows(modsResult.data);

  return json(200, {
    access: { role: access.role, canManageAdmins },
    stats: {
      totalMods: mods.length,
      publishedMods: mods.filter((item) => item.publish_state === 'published').length,
      completedDownloads: Number.isSafeInteger(downloads) ? downloads : 0,
      activeBillboards: billboards.filter((item) => item.state === 'published').length,
      adminAccounts: rows(accountsResult.data).length,
    },
    games: rows(gamesResult.data).map((item) => ({
      id: item.id, edition: item.edition, displayName: item.display_name, enabled: item.enabled,
    })),
    mods: mods.map((item) => ({
      id: item.id, name: item.name, summary: item.summary, gameId: item.game_id,
      state: item.publish_state, createdAt: item.created_at, updatedAt: item.updated_at,
    })),
    versions: rows(versionsResult.data).map((item) => ({
      id: item.id, modId: item.mod_id, version: item.version, gameEdition: item.game_edition,
      gameVersionRange: item.game_version_range, manifestSchemaVersion: item.manifest_schema_version,
      manifest: item.manifest, adapterId: item.adapter_id, state: item.publish_state,
      publishedAt: item.published_at, createdAt: item.created_at, updatedAt: item.updated_at,
    })),
    packages: rows(packagesResult.data).map((item) => ({
      versionId: item.version_id, byteSize: item.byte_size, sha256: item.sha256,
      verifiedAt: item.verified_at,
    })),
    media,
    billboards,
    metrics: metrics.map((item) => ({
      modId: item.mod_id, completedDownloads: item.completed_downloads,
      completedInstalls: item.completed_installs, favorites: item.favorites,
    })),
    accounts: rows(accountsResult.data).map((item) => ({
      id: item.user_id, email: item.email, username: item.username, role: item.role,
      canManageAdmins: item.can_manage_admins, createdAt: item.created_at,
      lastSignInAt: item.last_sign_in_at,
    })),
    recentActivity: rows(auditResult.data).map((item) => ({
      id: item.id, action: item.action, entityType: item.entity_type,
      entityId: item.entity_id, summary: item.summary, createdAt: item.created_at,
    })),
  });
};

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' });
  try {
    const context = await authenticate(request, true);
    const input = await parseJsonObject(request);
    if (input.action === 'snapshot') return await snapshot(context);

    if (input.action === 'save-draft') {
      if (!safeIdentifier(input.modId) || !boundedString(input.name, 1, 160) ||
          !boundedString(input.summary, 0, 2000) || !safeIdentifier(input.gameId) ||
          !(input.versionId === null || uuidString(input.versionId)) || !safeIdentifier(input.version, 80) ||
          !['legacy', 'enhanced', 'standard'].includes(String(input.gameEdition)) ||
          !(input.gameVersionRange === null || boundedString(input.gameVersionRange, 1, 80)) ||
          ![1, 2].includes(Number(input.manifestSchemaVersion)) ||
          typeof input.manifest !== 'object' || input.manifest === null || Array.isArray(input.manifest) ||
          JSON.stringify(input.manifest).length > 65536 ||
          !['generic-files', 'synthetic-container-fixture'].includes(String(input.adapterId)) ||
          !(input.expectedUpdatedAt === null || boundedString(input.expectedUpdatedAt, 1, 80))) {
        throw new Error('invalid-request');
      }
      const { data, error } = await context.database.rpc('planaria_save_mod_draft', {
        subject: context.subject, mod_identifier: input.modId, mod_name: input.name,
        mod_summary: input.summary, target_game: input.gameId, target_version: input.versionId,
        version_name: input.version, target_edition: input.gameEdition,
        target_game_version_range: input.gameVersionRange,
        target_manifest_schema_version: input.manifestSchemaVersion,
        target_manifest: input.manifest, target_adapter: input.adapterId,
        expected_updated_at: input.expectedUpdatedAt,
      });
      const row = rows(data)[0];
      if (error || !row) throw new Error('request-failed');
      return json(200, {
        versionId: row.version_id, modUpdatedAt: row.mod_updated_at,
        versionUpdatedAt: row.version_updated_at,
      });
    }

    if (['ready', 'publish', 'disable'].includes(String(input.action))) {
      if (!uuidString(input.versionId) || !boundedString(input.expectedUpdatedAt, 1, 80)) {
        throw new Error('invalid-request');
      }
      const procedure = input.action === 'ready'
        ? 'planaria_mark_version_ready'
        : input.action === 'publish' ? 'planaria_publish_version' : 'planaria_disable_version';
      const { data, error } = await context.database.rpc(procedure, {
        subject: context.subject, target_version: input.versionId,
        expected_updated_at: input.expectedUpdatedAt,
      });
      if (error || data !== true) throw new Error('request-failed');
      return json(200, { changed: true });
    }

    throw new Error('invalid-request');
  } catch (error) {
    return handleError(error);
  }
});
