/**
 * Naming and file-type rules shared by the content scripts and the service worker.
 *
 * Loaded as a plain script in the browser (everything lands on
 * `globalThis.MoodleDownloader`) and as a CommonJS module in tests.
 */
(function (exports) {
  'use strict';

  const FILE_GROUP_IDS = new Set([
    'pdf', 'presentation', 'document', 'spreadsheet', 'video',
    'audio', 'image', 'archive', 'link', 'other'
  ]);

  const FILE_GROUP_EXTENSIONS = {
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

  const FILE_GROUP_LABELS = {
    pdf: 'PDF',
    presentation: 'PPT',
    document: 'DOC',
    spreadsheet: 'XLS',
    video: 'VIDEO',
    audio: 'AUDIO',
    image: 'IMAGE',
    archive: 'ARCHIVE'
  };

  // Only used when the server names no file; enough for what Moodle resources usually are.
  const MIME_EXTENSIONS = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xls',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'image/png': 'png',
    'image/jpeg': 'jpg'
  };

  /** Makes one path segment safe on Windows, macOS and Linux. */
  function sanitizePathSegment(name) {
    if (!name) return '';
    return String(name)
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/[-. ]+$/g, '')
      .substring(0, 120)
      .replace(/[. ]+$/g, '');
  }

  function sanitizeFileName(name) {
    return sanitizePathSegment(name) || 'Unknown';
  }

  /** `Week 3 - Mechanical Properties` is saved as `Week 3`; any other title keeps its full name. */
  function describeSectionFolder(title) {
    const match = String(title || '').match(/^\s*Week\s*(\d+)\b/i);
    if (match) {
      const weekNumber = parseInt(match[1], 10);
      return { folderName: `Week ${weekNumber}`, weekNumber };
    }
    return { folderName: sanitizeFileName(title), weekNumber: undefined };
  }

  /** Appends `extension` unless the name already ends with it. */
  function withExtension(name, extension) {
    const cleanExtension = String(extension || '').replace(/^\./, '').toLowerCase();
    if (!cleanExtension) return name;
    return String(name).toLowerCase().endsWith(`.${cleanExtension}`) ? name : `${name}.${cleanExtension}`;
  }

  function extensionOf(filename) {
    const match = String(filename || '').trim().match(/\.([a-z0-9]{1,10})$/i);
    return match ? match[1].toLowerCase() : '';
  }

  function lastPathSegment(url) {
    try {
      return safeDecodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    } catch (error) {
      return String(url || '').split(/[?#]/)[0].split('/').pop() || '';
    }
  }

  function getFileExtension(url, name = '') {
    return extensionOf(name) || extensionOf(lastPathSegment(url));
  }

  function extensionFromMime(contentType) {
    const mime = String(contentType || '').toLowerCase().split(';')[0].trim();
    return MIME_EXTENSIONS[mime] || '';
  }

  function classifyExtension(extension) {
    for (const [fileGroup, extensions] of Object.entries(FILE_GROUP_EXTENSIONS)) {
      if (extensions.has(extension)) return { type: FILE_GROUP_LABELS[fileGroup], fileGroup, extension };
    }
    return null;
  }

  function classifyResource(url, name = '', contentType = '') {
    const extension = getFileExtension(url, name);
    const byExtension = classifyExtension(extension);
    if (byExtension) return byExtension;

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

  function normalizeExcludedFileGroups(value) {
    if (!Array.isArray(value)) return new Set();
    return new Set(value.filter(group => FILE_GROUP_IDS.has(group)));
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

  function safeDecodeURIComponent(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  Object.assign(exports, {
    FILE_GROUP_IDS,
    classifyResource,
    classifyResourceType,
    describeSectionFolder,
    extensionFromMime,
    extensionOf,
    getFileExtension,
    lastPathSegment,
    normalizeExcludedFileGroups,
    normalizeUrlForDedupe,
    safeDecodeURIComponent,
    sanitizeFileName,
    sanitizePathSegment,
    withExtension
  });
})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : (globalThis.MoodleDownloader = globalThis.MoodleDownloader || {}));
