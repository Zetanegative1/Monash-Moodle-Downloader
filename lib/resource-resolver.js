/**
 * Turns planned activities into downloadable resources. This is the only part
 * of a scan that talks to Moodle: it opens folders, finds out what file a
 * resource really is, and applies the size and file-type settings.
 */
(function (exports) {
  'use strict';

  const shared = typeof module !== 'undefined' && module.exports
    ? require('./shared.js')
    : globalThis.MoodleDownloader;
  const {
    classifyResource,
    extensionFromMime,
    extensionOf,
    lastPathSegment,
    normalizeExcludedFileGroups,
    normalizeUrlForDedupe,
    safeDecodeURIComponent,
    sanitizeFileName,
    sanitizePathSegment,
    withExtension
  } = shared;

  const FOLDER_CONCURRENCY = 4;
  const SIZE_CONCURRENCY = 8;
  const FOLDER_TIMEOUT_MS = 15000;
  const SIZE_TIMEOUT_MS = 5000;

  // Where Moodle puts the file when a resource is shown inside a page instead of redirecting to it.
  const RESOURCE_PAGE_FILE_SELECTORS = [
    ['.resourceworkaround a[href*="/pluginfile.php/"]', 'href'],
    ['a[href*="/mod_resource/content/"]', 'href'],
    ['object[data*="/mod_resource/content/"]', 'data'],
    ['iframe[src*="/mod_resource/content/"]', 'src'],
    ['embed[src*="/mod_resource/content/"]', 'src'],
    ['source[src*="/mod_resource/content/"]', 'src'],
    ['video[src*="/mod_resource/content/"]', 'src'],
    ['audio[src*="/mod_resource/content/"]', 'src'],
    ['img[src*="/mod_resource/content/"]', 'src']
  ];

  // The file areas staff fill in for an assignment. Submissions and feedback live in other areas.
  const ASSIGNMENT_FILE_PATH = /\/pluginfile\.php\/\d+\/mod_assign\/(?:introattachment\/\d+|intro)\/(.+)$/;

  function createScanContext(options = {}) {
    return {
      maxFileSizeBytes: normalizeMaxFileSize(options.maxFileSizeBytes),
      excludedFileGroups: normalizeExcludedFileGroups(options.excludedFileGroups),
      warnings: options.warnings || [],
      reportProgress: options.reportProgress || (() => {}),
      processedFileUrls: new Set(),
      folderLimiter: createTaskLimiter(FOLDER_CONCURRENCY),
      sizeLimiter: createTaskLimiter(SIZE_CONCURRENCY),
      folderProgress: { current: 0, total: 0 },
      sizeProgress: { current: 0, total: 0 }
    };
  }

  /** Resolves every group of a download plan into the `weeks` the popup and service worker consume. */
  async function resolvePlan(plan, context) {
    const prepared = plan.groups.map(group => ({
      group,
      tasks: group.activities.map(activity => {
        if (activity.kind === 'folder' || activity.kind === 'attachments') context.folderProgress.total += 1;
        return resolveActivity(activity, context);
      })
    }));

    const weeks = await Promise.all(prepared.map(async ({ group, tasks }) => ({
      name: sanitizeFileName(group.title),
      folderName: group.folderName,
      weekNumber: group.weekNumber,
      resources: (await Promise.all(tasks)).flat()
    })));

    return weeks.filter(week => week.resources.length > 0);
  }

  function resolveActivity(activity, context) {
    if (activity.kind === 'folder') return resolveFolder(activity, context);
    if (activity.kind === 'attachments') return resolveAttachments(activity, context);
    return finalizeResources([describeActivity(activity)], context);
  }

  function describeActivity(activity) {
    const base = { originalUrl: activity.url, sourceType: 'activity' };

    if (activity.kind === 'link') {
      return {
        ...base,
        name: sanitizeFileName(activity.name),
        type: 'URL',
        fileGroup: 'link',
        extension: 'url',
        url: activity.url
      };
    }

    if (activity.kind === 'embedded-file') {
      return {
        ...base,
        name: sanitizeFileName(activity.name),
        ...classifyResource(activity.url, activity.name),
        url: activity.url,
        sourceType: 'embedded-file'
      };
    }

    if (activity.directFileUrl) {
      const classification = classifyResource(activity.directFileUrl);
      return {
        ...base,
        name: withExtension(sanitizeFileName(activity.name), classification.extension),
        ...classification,
        url: activity.directFileUrl
      };
    }

    // A resource activity only links to view.php; the real file is known once Moodle answers.
    return {
      ...base,
      name: sanitizeFileName(activity.name),
      type: 'FILE',
      fileGroup: 'other',
      extension: '',
      url: activity.url,
      resolveFileName: true
    };
  }

  async function resolveFolder(activity, context) {
    const folderResources = await context.folderLimiter(async () => {
      try {
        const folderResult = await expandMoodleFolder(activity);
        if (folderResult.resources.length > 0) return folderResult.resources;
        if (folderResult.hasFileManager) return [];

        context.warnings.push({ code: 'folder-parse-failed', name: activity.name });
        return [createFolderZipFallback(activity, context.maxFileSizeBytes)];
      } catch (error) {
        context.warnings.push({
          code: 'folder-fetch-failed',
          name: activity.name,
          message: error.message
        });
        return [createFolderZipFallback(activity, context.maxFileSizeBytes)];
      } finally {
        context.folderProgress.current += 1;
        context.reportProgress?.({ phase: 'folders', ...context.folderProgress });
      }
    });

    return finalizeResources(folderResources, context);
  }

  async function expandMoodleFolder(activity) {
    const response = await fetchWithTimeout(activity.url, {
      credentials: 'same-origin',
      redirect: 'follow',
      headers: { Accept: 'text/html' }
    }, FOLDER_TIMEOUT_MS);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (isLoginUrl(response.url)) throw new Error('Moodle login is required');

    const html = await response.text();
    const documentFromHtml = new DOMParser().parseFromString(html, 'text/html');
    if (documentFromHtml.querySelector('form[action*="/login/index.php"]')) {
      throw new Error('Moodle login is required');
    }

    return parseMoodleFolderDocument(documentFromHtml, response.url || activity.url, activity.name);
  }

  function parseMoodleFolderDocument(folderDocument, folderUrl, folderName) {
    const fileLinks = folderDocument.querySelectorAll(
      'a[href*="/pluginfile.php/"][href*="/mod_folder/content/"]'
    );
    const resources = [];
    const seen = new Set();

    for (const link of fileLinks) {
      const rawHref = link.getAttribute('href') || link.href;
      if (!rawHref) continue;

      const fileUrl = new URL(rawHref, folderUrl).href;
      const key = normalizeUrlForDedupe(fileUrl);
      if (seen.has(key)) continue;
      seen.add(key);

      const pathInfo = deriveFolderRelativePath(fileUrl);
      const linkName = link.textContent?.trim() || '';
      const filename = sanitizeFileName(pathInfo.filename || linkName || 'Unknown');
      const folderSegments = [folderName, ...pathInfo.directories]
        .map(sanitizePathSegment)
        .filter(Boolean);

      const classification = classifyResource(fileUrl, filename);
      resources.push({
        name: filename,
        ...classification,
        url: fileUrl,
        originalUrl: folderUrl,
        folderPath: folderSegments.join('/'),
        sourceType: 'moodle-folder-file'
      });
    }

    const downloadForm = folderDocument.querySelector('form[action*="/mod/folder/download_folder.php"]');
    const formId = downloadForm?.querySelector('input[name="id"]')?.value;
    const nativeZipUrl = downloadForm && formId
      ? `${new URL(downloadForm.action, folderUrl).href}?id=${encodeURIComponent(formId)}`
      : null;

    return {
      resources,
      hasFileManager: Boolean(folderDocument.querySelector('.filemanager, .foldertree')),
      nativeZipUrl
    };
  }

  /** Opens an assignment page and collects the files attached to its description. */
  async function resolveAttachments(activity, context) {
    const attachments = await context.folderLimiter(async () => {
      try {
        const page = await fetchMoodlePage(activity.url);
        return parseAssignmentDocument(page.document, page.url, activity.name);
      } catch (error) {
        context.warnings.push({
          code: 'attachments-fetch-failed',
          name: activity.name,
          message: error.message
        });
        return [];
      } finally {
        context.folderProgress.current += 1;
        context.reportProgress?.({ phase: 'folders', ...context.folderProgress });
      }
    });

    return finalizeResources(attachments, context);
  }

  async function fetchMoodlePage(url) {
    const response = await fetchWithTimeout(url, {
      credentials: 'same-origin',
      redirect: 'follow',
      headers: { Accept: 'text/html' }
    }, FOLDER_TIMEOUT_MS);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (isLoginUrl(response.url)) throw new Error('Moodle login is required');

    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (page.querySelector('form[action*="/login/index.php"]')) throw new Error('Moodle login is required');
    return { document: page, url: response.url || url };
  }

  function parseAssignmentDocument(assignmentDocument, assignmentUrl, assignmentName) {
    const resources = [];
    const seen = new Set();

    for (const link of assignmentDocument.querySelectorAll('a[href*="/pluginfile.php/"]')) {
      let fileUrl;
      try {
        fileUrl = new URL(link.getAttribute('href'), assignmentUrl);
      } catch (error) {
        continue;
      }

      const match = fileUrl.pathname.match(ASSIGNMENT_FILE_PATH);
      // The same file is often linked twice, with and without `?forcedownload=1`.
      const key = fileUrl.origin + fileUrl.pathname;
      if (!match || seen.has(key)) continue;
      seen.add(key);

      const segments = match[1].split('/').filter(Boolean).map(safeDecodeURIComponent);
      const filename = sanitizeFileName(segments.pop() || link.textContent?.trim());
      resources.push({
        name: filename,
        ...classifyResource(fileUrl.href, filename),
        url: fileUrl.href,
        originalUrl: assignmentUrl,
        folderPath: [assignmentName, ...segments].map(sanitizePathSegment).filter(Boolean).join('/'),
        sourceType: 'assignment-file'
      });
    }

    return resources;
  }

  function deriveFolderRelativePath(fileUrl) {
    const pathname = new URL(fileUrl).pathname;
    const marker = '/mod_folder/content/0/';
    const markerIndex = pathname.indexOf(marker);
    const tail = markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) : pathname.split('/').pop();
    const segments = String(tail || '')
      .split('/')
      .filter(Boolean)
      .map(safeDecodeURIComponent);

    return {
      directories: segments.slice(0, -1),
      filename: segments.at(-1) || ''
    };
  }

  function createFolderZipFallback(activity, maxFileSizeBytes) {
    const sourceUrl = new URL(activity.url);
    const id = sourceUrl.searchParams.get('id');
    const zipUrl = new URL('/mod/folder/download_folder.php', sourceUrl.origin);
    if (id) zipUrl.searchParams.set('id', id);

    const sizeLimitEnabled = Boolean(maxFileSizeBytes);
    return {
      name: `${sanitizeFileName(activity.name)}.zip`,
      type: 'FOLDER_ZIP',
      fileGroup: 'archive',
      extension: 'zip',
      url: zipUrl.href,
      originalUrl: activity.url,
      sourceType: 'moodle-folder-zip',
      downloadable: !sizeLimitEnabled,
      sizeStatus: sizeLimitEnabled ? 'unknown' : 'not-checked',
      skipReason: sizeLimitEnabled ? 'size-unknown' : undefined
    };
  }

  /** Works out the final name, type, size and download decision of each resource. */
  async function finalizeResources(resources, context) {
    const tasks = [];

    for (const resource of resources) {
      const normalizedResource = resource.fileGroup
        ? resource
        : { ...classifyResource(resource.url, resource.name), ...resource };
      const key = normalizeUrlForDedupe(normalizedResource.url);
      if (context.processedFileUrls.has(key)) continue;
      context.processedFileUrls.add(key);

      const canProbe = shouldProbeFileSize(normalizedResource);
      const needsNameProbe = canProbe && normalizedResource.resolveFileName === true;
      const needsTypeProbe = needsNameProbe || (canProbe
        && normalizedResource.fileGroup === 'other'
        && context.excludedFileGroups.size > 0);

      if (!needsTypeProbe && context.excludedFileGroups.has(normalizedResource.fileGroup)) {
        tasks.push(Promise.resolve({
          ...normalizedResource,
          downloadable: false,
          sizeStatus: normalizedResource.sizeStatus || 'not-checked',
          skipReason: 'file-type'
        }));
        continue;
      }

      const needsSizeProbe = Boolean(context.maxFileSizeBytes) && canProbe;
      if (!needsTypeProbe && !needsSizeProbe) {
        tasks.push(Promise.resolve({
          ...normalizedResource,
          downloadable: normalizedResource.downloadable !== false,
          sizeStatus: normalizedResource.sizeStatus || (context.maxFileSizeBytes ? 'not-applicable' : 'not-checked')
        }));
        continue;
      }

      context.sizeProgress.total += 1;
      tasks.push(context.sizeLimiter(async () => {
        const result = needsNameProbe
          ? await resolveResourceFile(normalizedResource.url)
          : await probeFileMetadata(normalizedResource.url);
        context.sizeProgress.current += 1;
        context.reportProgress?.({ phase: 'sizes', ...context.sizeProgress });

        let resolvedResource = normalizedResource;
        if (needsNameProbe) {
          resolvedResource = applyResolvedFile(normalizedResource, result);
        } else if (needsTypeProbe) {
          const responseName = extractFilenameFromContentDisposition(result.contentDisposition);
          const detected = classifyResource(
            result.finalUrl || normalizedResource.url,
            responseName || normalizedResource.name,
            result.contentType
          );
          resolvedResource = { ...normalizedResource, ...detected };
        }

        if (context.excludedFileGroups.has(resolvedResource.fileGroup)) {
          return {
            ...resolvedResource,
            sizeBytes: result.status === 'known' ? result.bytes : undefined,
            sizeStatus: result.status === 'known' ? 'known' : 'not-checked',
            downloadable: false,
            skipReason: 'file-type'
          };
        }

        if (!needsSizeProbe) {
          return {
            ...resolvedResource,
            sizeBytes: result.status === 'known' ? result.bytes : undefined,
            sizeStatus: result.status === 'known' ? 'known' : 'not-checked',
            downloadable: resolvedResource.downloadable !== false
          };
        }

        if (result.status !== 'known') {
          return {
            ...resolvedResource,
            downloadable: false,
            sizeStatus: 'unknown',
            skipReason: 'size-unknown'
          };
        }

        const overLimit = result.bytes > context.maxFileSizeBytes;
        return {
          ...resolvedResource,
          sizeBytes: result.bytes,
          sizeStatus: 'known',
          downloadable: !overLimit,
          skipReason: overLimit ? 'size-limit' : undefined
        };
      }));
    }

    return Promise.all(tasks);
  }

  /** Names a resource activity after itself, with the extension of the file Moodle actually serves. */
  function applyResolvedFile(resource, metadata) {
    const { resolveFileName, ...resolved } = resource;
    const servedDirectly = isPluginfileUrl(metadata.finalUrl);
    const servedName = extractFilenameFromContentDisposition(metadata.contentDisposition)
      || (servedDirectly ? lastPathSegment(metadata.finalUrl) : '');
    if (!servedName && !metadata.contentType) return resolved;

    const detected = classifyResource('', servedName, metadata.contentType);
    const extension = extensionOf(servedName) || extensionFromMime(metadata.contentType);
    return {
      ...resolved,
      ...detected,
      extension,
      name: withExtension(resolved.name, extension),
      url: servedDirectly ? metadata.finalUrl : resolved.url
    };
  }

  /**
   * `mod/resource/view.php` either redirects to the file or, depending on the
   * activity's display setting, renders a page that embeds or links to it.
   */
  async function resolveResourceFile(viewUrl) {
    const metadata = await probeFileMetadata(viewUrl);
    const isPage = /^text\/html\b/i.test(metadata.contentType || '') && !isPluginfileUrl(metadata.finalUrl);
    if (!isPage) return metadata;

    const fileUrl = await findFileOnResourcePage(viewUrl).catch(() => null);
    if (!fileUrl) return { status: 'unknown', finalUrl: viewUrl, contentType: '', contentDisposition: '' };

    const fileMetadata = await probeFileMetadata(fileUrl);
    return { ...fileMetadata, finalUrl: isPluginfileUrl(fileMetadata.finalUrl) ? fileMetadata.finalUrl : fileUrl };
  }

  async function findFileOnResourcePage(viewUrl) {
    const response = await fetchWithTimeout(viewUrl, {
      credentials: 'same-origin',
      redirect: 'follow',
      headers: { Accept: 'text/html' }
    }, FOLDER_TIMEOUT_MS);
    if (!response.ok || isLoginUrl(response.url)) return null;

    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    return findResourceFileInDocument(page, response.url || viewUrl);
  }

  function findResourceFileInDocument(page, pageUrl) {
    for (const [selector, attribute] of RESOURCE_PAGE_FILE_SELECTORS) {
      const value = page.querySelector(selector)?.getAttribute(attribute);
      if (!value) continue;
      try {
        return new URL(value, pageUrl).href;
      } catch (error) {
        // Try the next place Moodle may have put the file.
      }
    }
    return null;
  }

  function shouldProbeFileSize(resource) {
    if (resource.type === 'URL' || resource.type === 'FOLDER_ZIP') return false;
    if (resource.type === 'VIDEO' && !isDirectMediaUrl(resource.url)) return false;
    return /^https?:/i.test(resource.url || '');
  }

  async function probeFileSize(url) {
    const result = await probeFileMetadata(url);
    return result.status === 'known'
      ? { status: 'known', bytes: result.bytes }
      : { status: 'unknown' };
  }

  async function probeFileMetadata(url) {
    let headMetadata = { status: 'unknown', finalUrl: url };
    try {
      const headResponse = await fetchWithTimeout(url, {
        method: 'HEAD',
        credentials: 'same-origin',
        redirect: 'follow'
      }, SIZE_TIMEOUT_MS);

      if (headResponse.ok && !isLoginUrl(headResponse.url)) {
        const contentLength = parseByteCount(headResponse.headers.get('content-length'));
        headMetadata = getResponseMetadata(headResponse, url);
        if (contentLength !== null) return { ...headMetadata, status: 'known', bytes: contentLength };
      }
    } catch (error) {
      // Fall through to a one-byte range probe.
    }

    try {
      const rangeResponse = await fetchWithTimeout(url, {
        method: 'GET',
        credentials: 'same-origin',
        redirect: 'follow',
        headers: { Range: 'bytes=0-0' }
      }, SIZE_TIMEOUT_MS);

      const contentRange = rangeResponse.headers.get('content-range');
      const rangeMatch = contentRange?.match(/\/(\d+)$/);
      const rangeSize = rangeMatch ? parseByteCount(rangeMatch[1]) : null;
      const contentLength = parseByteCount(rangeResponse.headers.get('content-length'));
      if (rangeResponse.body) await rangeResponse.body.cancel().catch(() => {});

      if (!isLoginUrl(rangeResponse.url)) {
        const metadata = getResponseMetadata(rangeResponse, url);
        if (rangeSize !== null) return { ...metadata, status: 'known', bytes: rangeSize };
        if (rangeResponse.ok && contentLength !== null) return { ...metadata, status: 'known', bytes: contentLength };
        return metadata;
      }
    } catch (error) {
      // Unknown size is handled by the caller.
    }

    return headMetadata;
  }

  function getResponseMetadata(response, fallbackUrl) {
    return {
      status: 'unknown',
      finalUrl: response.url || fallbackUrl,
      contentType: response.headers.get('content-type') || '',
      contentDisposition: response.headers.get('content-disposition') || ''
    };
  }

  function extractFilenameFromContentDisposition(value) {
    if (!value) return '';
    const encoded = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    if (encoded) return safeDecodeURIComponent(encoded[1].replace(/^"|"$/g, ''));
    const plain = value.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i);
    return (plain?.[1] || plain?.[2] || '').trim().replace(/^"|"$/g, '');
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  function createTaskLimiter(limit) {
    let active = 0;
    const queue = [];

    const runNext = () => {
      if (active >= limit || queue.length === 0) return;
      const { task, resolve, reject } = queue.shift();
      active += 1;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          runNext();
        });
    };

    return task => new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      runNext();
    });
  }

  function isMoodleFolderUrl(url) {
    try {
      return new URL(url).pathname === '/mod/folder/view.php';
    } catch (error) {
      return false;
    }
  }

  function isPluginfileUrl(url) {
    try {
      return new URL(url).pathname.includes('/pluginfile.php/');
    } catch (error) {
      return false;
    }
  }

  function isDirectMediaUrl(url) {
    return /\.(?:mp4|webm|avi|mov|m4v|mkv|ogv|mpeg|mpg)(?:[?#]|$)/i.test(url || '');
  }

  function isLoginUrl(url) {
    return /\/login\/(?:index\.php)?/i.test(url || '');
  }

  function normalizeMaxFileSize(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
  }

  function parseByteCount(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  Object.assign(exports, {
    createScanContext,
    createTaskLimiter,
    deriveFolderRelativePath,
    finalizeResources,
    findResourceFileInDocument,
    isMoodleFolderUrl,
    normalizeMaxFileSize,
    parseByteCount,
    parseAssignmentDocument,
    parseMoodleFolderDocument,
    probeFileSize,
    resolvePlan
  });
})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : (globalThis.MoodleDownloader = globalThis.MoodleDownloader || {}));
