import { Router } from 'express';
import { callCurseForge, checkApiKey, CurseForgeError } from './curseforge.js';

/**
 * Routes deliberately mirror CurseForge's own paths so the bridge stays a thin, stable proxy and
 * all normalisation happens in the launcher.
 */

const SEARCH_PARAMS = [
  'gameId',
  'classId',
  'categoryId',
  'categoryIds',
  'gameVersion',
  'gameVersions',
  'searchFilter',
  'sortField',
  'sortOrder',
  'modLoaderType',
  'modLoaderTypes',
  'gameVersionTypeId',
  'authorId',
  'primaryAuthorId',
  'slug',
  'index',
  'pageSize',
];

const FILE_PARAMS = ['gameVersion', 'modLoaderType', 'gameVersionTypeId', 'index', 'pageSize'];

/** Copies only known query parameters through, so nothing unexpected reaches the upstream API. */
function forwardQuery(query, allowed) {
  const params = new URLSearchParams();
  for (const name of allowed) {
    const value = query[name];
    if (value !== undefined && value !== '') {
      params.append(name, String(value));
    }
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

function send(res, next, promise) {
  promise.then((payload) => res.json(payload)).catch(next);
}

export function createRouter() {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const key = await checkApiKey();
    res.json({
      ok: true,
      service: 'volt-curseforge-bridge',
      curseforge: key.ok,
      reason: key.ok ? undefined : key.reason,
    });
  });

  router.get('/v1/mods/search', (req, res, next) => {
    send(res, next, callCurseForge(`/v1/mods/search${forwardQuery(req.query, SEARCH_PARAMS)}`));
  });

  router.get('/v1/categories', (req, res, next) => {
    send(res, next, callCurseForge(`/v1/categories${forwardQuery(req.query, ['gameId', 'classId', 'classesOnly'])}`));
  });

  /** Bulk file lookup — used when installing a CurseForge modpack manifest. */
  router.post('/v1/mods/files', (req, res, next) => {
    const fileIds = Array.isArray(req.body?.fileIds) ? req.body.fileIds : null;
    if (!fileIds || fileIds.length === 0) {
      return next(new CurseForgeError('Body must contain a non-empty "fileIds" array', 400));
    }
    send(res, next, callCurseForge('/v1/mods/files', { method: 'POST', body: { fileIds }, cacheable: true }));
  });

  /**
   * Identifies local files by CurseForge's murmur2 fingerprint. This is how a jar that the
   * launcher did not install itself gets matched back to its project, so its versions can be
   * managed like any other.
   */
  router.post('/v1/fingerprints', (req, res, next) => {
    const fingerprints = Array.isArray(req.body?.fingerprints) ? req.body.fingerprints : null;
    if (!fingerprints || fingerprints.length === 0) {
      return next(new CurseForgeError('Body must contain a non-empty "fingerprints" array', 400));
    }
    send(res, next, callCurseForge('/v1/fingerprints', { method: 'POST', body: { fingerprints }, cacheable: true }));
  });

  /** Bulk project lookup. */
  router.post('/v1/mods', (req, res, next) => {
    const modIds = Array.isArray(req.body?.modIds) ? req.body.modIds : null;
    if (!modIds || modIds.length === 0) {
      return next(new CurseForgeError('Body must contain a non-empty "modIds" array', 400));
    }
    send(res, next, callCurseForge('/v1/mods', { method: 'POST', body: { modIds }, cacheable: true }));
  });

  router.get('/v1/files/:fileId', (req, res, next) => {
    // CurseForge has no "file by id alone" route, so the bulk endpoint stands in for it.
    const fileId = Number.parseInt(req.params.fileId, 10);
    if (!Number.isFinite(fileId)) {
      return next(new CurseForgeError('fileId must be numeric', 400));
    }
    send(
      res,
      next,
      callCurseForge('/v1/mods/files', { method: 'POST', body: { fileIds: [fileId] }, cacheable: true }).then(
        (payload) => {
          const file = payload?.data?.[0];
          if (!file) {
            throw new CurseForgeError(`No CurseForge file with id ${fileId}`, 404);
          }
          return { data: file };
        },
      ),
    );
  });

  router.get('/v1/mods/:modId/files', (req, res, next) => {
    send(
      res,
      next,
      callCurseForge(`/v1/mods/${encodeURIComponent(req.params.modId)}/files${forwardQuery(req.query, FILE_PARAMS)}`),
    );
  });

  router.get('/v1/mods/:modId/files/:fileId', (req, res, next) => {
    send(
      res,
      next,
      callCurseForge(
        `/v1/mods/${encodeURIComponent(req.params.modId)}/files/${encodeURIComponent(req.params.fileId)}`,
      ),
    );
  });

  /**
   * Project detail. CurseForge serves the rendered description from a separate endpoint; it is
   * inlined here as `descriptionHtml` so the launcher needs a single round trip for a project page.
   */
  router.get('/v1/mods/:modId', (req, res, next) => {
    const modId = encodeURIComponent(req.params.modId);
    send(
      res,
      next,
      (async () => {
        const mod = await callCurseForge(`/v1/mods/${modId}`);
        try {
          const description = await callCurseForge(`/v1/mods/${modId}/description`);
          if (mod?.data && typeof description?.data === 'string') {
            mod.data.descriptionHtml = description.data;
          }
        } catch {
          // A missing description must not fail the whole project page.
        }
        return mod;
      })(),
    );
  });

  return router;
}
