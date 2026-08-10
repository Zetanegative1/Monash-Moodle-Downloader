const FOLDER_CONCURRENCY = 4;
const SIZE_CONCURRENCY = 8;
const FOLDER_TIMEOUT_MS = 15000;
const SIZE_TIMEOUT_MS = 5000;
const FILE_GROUP_IDS = new Set([
  'pdf', 'presentation', 'document', 'spreadsheet', 'video',
  'audio', 'image', 'archive', 'link', 'other'
]);

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action !== 'scanResources') return false;

    scanPageResources({
      maxFileSizeBytes: request.maxFileSizeBytes,
      excludedFileGroups: request.excludedFileGroups
    })
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  });
}

async function scanPageResources(options = {}) {
  const resources = [];
  const warnings = [];
  const courseName = getCourseName();
  const maxFileSizeBytes = normalizeMaxFileSize(options.maxFileSizeBytes);
  const context = {
    maxFileSizeBytes,
    excludedFileGroups: normalizeExcludedFileGroups(options.excludedFileGroups),
    warnings,
    processedFileUrls: new Set(),
    folderLimiter: createTaskLimiter(FOLDER_CONCURRENCY),
    sizeLimiter: createTaskLimiter(SIZE_CONCURRENCY),
    folderProgress: { current: 0, total: 0 },
    sizeProgress: { current: 0, total: 0 }
  };

  const hasCourseIndex = document.querySelector('.courseindex');
  const isWeekPage = /[?&]section=\d+/.test(window.location.href);
  const definitions = hasCourseIndex && !isWeekPage
    ? getCourseIndexWeekDefinitions()
    : getPageWeekDefinitions();

  if (definitions.length === 0) return { resources, warnings };

  const weeks = await processWeekDefinitions(definitions, context);
  if (weeks.length > 0) {
    resources.push({
      name: courseName,
      weeks,
      scanType: hasCourseIndex && !isWeekPage ? 'courseindex' : 'weekpage'
    });
  }

  return { resources, warnings };
}

function getCourseIndexWeekDefinitions() {
  const weekContainer = findWeekContainer();
  if (!weekContainer) return [];

  return Array.from(weekContainer.children)
    .filter(el => el.classList?.contains('courseindex-section'))
    .map(section => {
      const titleLink = section.querySelector(':scope > .courseindex-item .courseindex-link[data-for="section_title"]')
        || section.querySelector('.courseindex-link[data-for="section_title"]');
      const title = titleLink?.textContent?.trim();
      if (!title) return null;

      return {
        name: sanitizeFileName(title),
        weekNumber: extractWeekNumber(title) || undefined,
        activities: collectActivityDescriptors(
          section.querySelectorAll('.courseindex-link[data-for="cm_name"]'),
          'courseindex'
        )
      };
    })
    .filter(Boolean);
}

function getPageWeekDefinitions() {
  const definitions = [];

  document.querySelectorAll('li[data-sectionid], .course-section, [data-section-id]').forEach(section => {
    const sectionName = extractSectionName(section);
    if (!sectionName || sectionName === 'Section_null') return;

    const links = section.querySelectorAll(
      '.activityinstance a, a[href*="/mod/resource/"], a[href*="/mod/folder/"], '
      + 'a[href*="/mod/url/"], a[href*="/mod/page/"], a.activityname'
    );
    const activities = collectActivityDescriptors(links, 'weekpage');
    if (activities.length === 0) return;

    definitions.push({
      name: sanitizeFileName(sectionName),
      weekNumber: extractWeekNumber(sectionName) || undefined,
      activities
    });
  });

  return definitions;
}

function collectActivityDescriptors(links, source) {
  const seen = new Set();
  const descriptors = [];

  for (const link of links) {
    const url = link.href;
    if (!url || seen.has(url)) continue;

    const name = source === 'weekpage'
      ? extractActivityName(link)
      : link.textContent?.trim() || link.getAttribute('title') || '';
    if (!name) continue;

    const directResourceLink = link.closest('li')?.querySelector('a[href*="/mod_resource/content/"]');
    descriptors.push({
      url,
      name: name.substring(0, 150),
      directResourceUrl: directResourceLink?.href || null
    });
    seen.add(url);
  }

  return descriptors;
}

function extractActivityName(link) {
  for (const selector of ['.instancename', '.activityname', '[data-region="activity-name"]']) {
    const element = link.closest('.activityinstance')?.querySelector(selector) || link.querySelector(selector);
    if (!element) continue;

    const text = element.textContent?.trim()
      .replace(/\s*(File|PDF|PowerPoint|Word|Video|Folder)\s*$/gi, '')
      .trim();
    if (text) return text;
  }

  return (link.textContent?.trim() || link.getAttribute('title') || '').trim();
}

async function processWeekDefinitions(definitions, context) {
  const seenActivities = new Set();
  const prepared = definitions.map(definition => ({ ...definition, tasks: [] }));

  for (const week of prepared) {
    for (const activity of week.activities) {
      const activityKey = normalizeUrlForDedupe(activity.url);
      if (seenActivities.has(activityKey)) continue;
      seenActivities.add(activityKey);

      if (isMoodleFolderUrl(activity.url)) context.folderProgress.total += 1;
      week.tasks.push(processActivity(activity, context));
    }
  }

  const results = await Promise.all(prepared.map(async week => {
    const groups = await Promise.all(week.tasks);
    return {
      name: week.name,
      weekNumber: week.weekNumber,
      resources: groups.flat()
    };
  }));

  return results
    .filter(week => week.resources.length > 0)
    .sort((a, b) => (a.weekNumber ?? Infinity) - (b.weekNumber ?? Infinity));
}

async function processActivity(activity, context) {
  if (isMoodleFolderUrl(activity.url)) {
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
        reportScanProgress({ phase: 'folders', ...context.folderProgress });
      }
    });

    return finalizeResources(folderResources, context);
  }

  const resource = extractRegularResource(activity);
  return resource ? finalizeResources([resource], context) : [];
}

function extractRegularResource(activity) {
  const originalUrl = activity.url;
  const lowerUrl = originalUrl.toLowerCase();
  let downloadUrl = activity.directResourceUrl || originalUrl;
  let classification = { type: 'FILE', fileGroup: 'other', extension: '' };

  if (originalUrl.includes('/mod/resource/view.php') && !activity.directResourceUrl) {
    const idMatch = originalUrl.match(/[?&]id=(\d+)/);
    const realLink = idMatch ? findRealResourceLink(idMatch[1]) : null;
    if (realLink) downloadUrl = realLink;
  }

  if (originalUrl.includes('panopto') || originalUrl.includes('/mod/lti/') || lowerUrl.includes('video')) {
    classification = { type: 'VIDEO', fileGroup: 'video', extension: '' };
  } else if (originalUrl.includes('/mod/url/view.php')) {
    classification = { type: 'URL', fileGroup: 'link', extension: 'url' };
  } else {
    classification = classifyResource(downloadUrl, activity.name);
  }

  return {
    name: sanitizeFileName(activity.name),
    ...classification,
    url: downloadUrl,
    originalUrl,
    sourceType: 'activity'
  };
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
    name: `${sanitizePathSegment(activity.name)}.zip`,
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
    const needsTypeProbe = canProbe
      && normalizedResource.fileGroup === 'other'
      && context.excludedFileGroups.size > 0;

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
      const result = await probeFileMetadata(normalizedResource.url);
      context.sizeProgress.current += 1;
      reportScanProgress({ phase: 'sizes', ...context.sizeProgress });

      let resolvedResource = normalizedResource;
      if (needsTypeProbe) {
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

function reportScanProgress(progress) {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
  try {
    const result = chrome.runtime.sendMessage({ action: 'scanProgress', ...progress });
    if (result?.catch) result.catch(() => {});
  } catch (error) {
    // The popup may have been closed during a scan.
  }
}

function findWeekContainer() {
  const titleLinks = document.querySelectorAll('.courseindex-link[data-for="section_title"]');

  for (const link of titleLinks) {
    if (!/^\s*Learning\s*$/i.test(link.textContent || '')) continue;
    const section = link.closest('.courseindex-section');
    const wrapper = section?.querySelector(':scope > .courseindex-item-content .courseindex-sectioncontent-children')
      || section?.querySelector('.courseindex-sectioncontent-children');
    if (wrapper) return wrapper;
  }

  for (const link of titleLinks) {
    if (!/week\s*\d+/i.test(link.textContent || '')) continue;
    const parent = link.closest('.courseindex-section')?.parentElement;
    if (parent?.classList.contains('courseindex-sectioncontent-children')) return parent;
  }

  return document.querySelector('.courseindex');
}

function findRealResourceLink(resourceId) {
  try {
    const contentLinks = document.querySelectorAll('a[href*="/mod_resource/content/"]');
    for (const link of contentLinks) {
      const href = link.href;
      if (href.includes(`resource/content/${resourceId}`) || link.getAttribute('data-content-id') === resourceId) {
        return href;
      }
    }

    const activities = document.querySelectorAll('.activityinstance');
    for (const activity of activities) {
      const link = activity.querySelector('a[href*="/mod_resource/content/"]');
      const activityId = activity.closest('li')?.getAttribute('data-id');
      if (link && (activityId === resourceId || link.href.includes(`/content/${resourceId}/`))) {
        return link.href;
      }
    }
  } catch (error) {
    // Keep the original activity URL when Moodle does not expose a direct link.
  }
  return null;
}

function getCourseName() {
  const h1 = document.querySelector('h1');
  if (h1?.textContent?.trim()) return sanitizeFileName(h1.textContent.trim());

  for (const selector of ['.page-context-header', '.course-title', '[data-region="course-title"]']) {
    const text = document.querySelector(selector)?.textContent?.trim();
    if (text) return sanitizeFileName(text);
  }

  const match = document.title.match(/[A-Z]{4}\d{4}/);
  return match ? match[0] : 'Course';
}

function extractSectionName(section) {
  for (const selector of ['.sectionname', 'h3', 'h4', '.section-header', '[aria-label]']) {
    const element = section.querySelector(selector);
    if (!element) continue;
    const label = element.getAttribute('aria-label');
    if (label) return label.trim();
    const text = element.textContent?.trim();
    if (text && text.length < 100) return text;
  }

  const id = section.getAttribute('data-sectionid') || section.getAttribute('data-section-id');
  return id ? `Section_${id}` : null;
}

function extractWeekNumber(name) {
  const match = name.match(/week\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function isMoodleFolderUrl(url) {
  try {
    return new URL(url).pathname === '/mod/folder/view.php';
  } catch (error) {
    return false;
  }
}

function classifyResource(url, name = '', contentType = '') {
  const extension = getFileExtension(url, name);
  const groups = {
    pdf: new Set(['pdf']),
    presentation: new Set(['ppt', 'pptx', 'pps', 'ppsx', 'odp', 'key']),
    document: new Set([
      'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'epub', 'pages',
      'html', 'htm', 'xml', 'json', 'yaml', 'yml', 'ipynb'
    ]),
    spreadsheet: new Set(['xls', 'xlsx', 'xlsm', 'xlsb', 'ods', 'csv', 'tsv']),
    video: new Set(['mp4', 'webm', 'avi', 'mov', 'm4v', 'mkv', 'ogv', 'mpeg', 'mpg']),
    audio: new Set(['mp3', 'm4a', 'wav', 'flac', 'aac', 'ogg', 'opus', 'wma']),
    image: new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff', 'heic']),
    archive: new Set(['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'])
  };
  const labels = {
    pdf: 'PDF',
    presentation: 'PPT',
    document: 'DOC',
    spreadsheet: 'XLS',
    video: 'VIDEO',
    audio: 'AUDIO',
    image: 'IMAGE',
    archive: 'ARCHIVE'
  };

  for (const [fileGroup, extensions] of Object.entries(groups)) {
    if (extensions.has(extension)) return { type: labels[fileGroup], fileGroup, extension };
  }

  const mime = String(contentType || '').toLowerCase().split(';')[0].trim();
  if (mime === 'application/pdf') return { type: 'PDF', fileGroup: 'pdf', extension };
  if (/presentation|powerpoint/.test(mime)) return { type: 'PPT', fileGroup: 'presentation', extension };
  if (/spreadsheet|excel|csv/.test(mime)) return { type: 'XLS', fileGroup: 'spreadsheet', extension };
  if (mime.startsWith('video/')) return { type: 'VIDEO', fileGroup: 'video', extension };
  if (mime.startsWith('audio/')) return { type: 'AUDIO', fileGroup: 'audio', extension };
  if (mime.startsWith('image/')) return { type: 'IMAGE', fileGroup: 'image', extension };
  if (/zip|rar|7z|gzip|tar|compressed/.test(mime)) return { type: 'ARCHIVE', fileGroup: 'archive', extension };
  if (mime.startsWith('text/') || /word|document|epub|json|xml/.test(mime)) {
    return { type: 'DOC', fileGroup: 'document', extension };
  }

  return { type: 'FILE', fileGroup: 'other', extension };
}

function classifyResourceType(url, name = '') {
  return classifyResource(url, name).type;
}

function getFileExtension(url, name = '') {
  const candidates = [name];
  try {
    candidates.push(safeDecodeURIComponent(new URL(url).pathname.split('/').pop() || ''));
  } catch (error) {
    candidates.push(String(url || '').split(/[?#]/)[0].split('/').pop() || '');
  }

  for (const candidate of candidates) {
    const match = String(candidate || '').trim().match(/\.([a-z0-9]{1,10})$/i);
    if (match) return match[1].toLowerCase();
  }
  return '';
}

function normalizeExcludedFileGroups(value) {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter(group => FILE_GROUP_IDS.has(group)));
}

function isDirectMediaUrl(url) {
  return /\.(?:mp4|webm|avi|mov|m4v|mkv|ogv|mpeg|mpg)(?:[?#]|$)/i.test(url || '');
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

function normalizeUrlForDedupe(url) {
  try {
    const normalized = new URL(url);
    normalized.hash = '';
    return normalized.href;
  } catch (error) {
    return String(url || '');
  }
}

function isLoginUrl(url) {
  return /\/login\/(?:index\.php)?/i.test(url || '');
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function sanitizePathSegment(name) {
  if (!name) return '';
  return String(name)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .substring(0, 120);
}

function sanitizeFileName(name) {
  return sanitizePathSegment(name) || 'Unknown';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    classifyResource,
    classifyResourceType,
    createTaskLimiter,
    deriveFolderRelativePath,
    finalizeResources,
    isMoodleFolderUrl,
    normalizeMaxFileSize,
    normalizeExcludedFileGroups,
    parseByteCount,
    parseMoodleFolderDocument,
    probeFileSize,
    sanitizeFileName,
    sanitizePathSegment
  };
}
