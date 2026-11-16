/**
 * A deterministic stand-in for learning.monash.edu, used wherever the extension
 * would touch the network: folder expansion, file type / size probing, downloads.
 *
 * Everything is derived from the course-module id, so a test can predict what
 * the "server" holds for any activity without a lookup table.
 */
const ORIGIN = 'https://learning.monash.edu';
const MB = 1024 * 1024;

const RESOURCE_TYPES = [
  { extension: 'pdf', fileGroup: 'pdf', contentType: 'application/pdf' },
  {
    extension: 'pptx',
    fileGroup: 'presentation',
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  },
  {
    extension: 'docx',
    fileGroup: 'document',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
];

const CONTENT_TYPES = {
  pdf: 'application/pdf',
  pptx: RESOURCE_TYPES[1].contentType,
  docx: RESOURCE_TYPES[2].contentType,
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

const EMBEDDED_FILE_BYTES = MB;

/** The file a `mod/resource` activity redirects to. Sizes range from 6 MB to 30 MB. */
function resourceFile(cmId) {
  const id = Number(cmId);
  const type = RESOURCE_TYPES[id % RESOURCE_TYPES.length];
  const filename = `resource-${id}.${type.extension}`;
  return {
    ...type,
    filename,
    bytes: ((id % 5) + 1) * 6 * MB,
    url: `${ORIGIN}/pluginfile.php/${id}/mod_resource/content/1/${filename}`
  };
}

/** The files inside a `mod/folder` activity: one at the top level, one in a subdirectory. */
function folderFiles(cmId) {
  const id = Number(cmId);
  const files = [
    { relativePath: `Folder ${id} notes.pdf`, fileGroup: 'pdf', bytes: 2 * MB },
    { relativePath: `Data/Folder ${id} data.xlsx`, fileGroup: 'spreadsheet', bytes: MB }
  ];
  return files.map(file => ({
    ...file,
    url: `${ORIGIN}/pluginfile.php/${id}/mod_folder/content/0/`
      + `${file.relativePath.split('/').map(encodeURIComponent).join('/')}?forcedownload=1`
  }));
}

function folderPageHtml(cmId) {
  const links = folderFiles(cmId)
    .map(file => `<a href="${file.url.replace(/&/g, '&amp;')}">${file.relativePath.split('/').pop()}</a>`)
    .join('\n');
  return `<!DOCTYPE html><html><body><div id="region-main">
<div class="foldertree"><div class="filemanager">
${links}
</div></div>
<form action="${ORIGIN}/mod/folder/download_folder.php" method="post"><input type="hidden" name="id" value="${cmId}"></form>
</div></body></html>`;
}

function extensionOf(pathname) {
  const match = decodeURIComponent(pathname).match(/\.([a-z0-9]{1,10})$/i);
  return match ? match[1].toLowerCase() : '';
}

/** What the server would send for a URL: where it ends up, its type, size and filename. */
function describeUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.origin !== ORIGIN) return null;

  const cmId = url.searchParams.get('id');
  const moduleMatch = url.pathname.match(/^\/mod\/([a-z0-9_]+)\/view\.php$/);

  if (moduleMatch?.[1] === 'resource' && cmId) {
    const file = resourceFile(cmId);
    return { finalUrl: file.url, filename: file.filename, contentType: file.contentType, bytes: file.bytes };
  }
  if (moduleMatch?.[1] === 'folder' && cmId) {
    const html = folderPageHtml(cmId);
    return { finalUrl: url.href, contentType: 'text/html; charset=utf-8', bytes: Buffer.byteLength(html), body: html };
  }

  const pluginfile = url.pathname.match(/^\/pluginfile\.php\/(\d+)\/(mod_resource\/content\/\d+|mod_folder\/content\/0)\/(.+)$/);
  if (pluginfile) {
    const [, id, area, tail] = pluginfile;
    const relativePath = tail.split('/').map(decodeURIComponent).join('/');
    const known = area.startsWith('mod_resource')
      ? [resourceFile(id)].filter(file => file.filename === relativePath)[0]
      : folderFiles(id).find(file => file.relativePath === relativePath);
    if (!known) return null;
    const filename = relativePath.split('/').pop();
    return {
      finalUrl: url.href,
      filename,
      contentType: CONTENT_TYPES[extensionOf(filename)] || 'application/octet-stream',
      bytes: known.bytes
    };
  }

  if (url.pathname.startsWith('/pluginfile.php/')) {
    const filename = decodeURIComponent(url.pathname.split('/').pop());
    return {
      finalUrl: url.href,
      filename,
      contentType: CONTENT_TYPES[extensionOf(filename)] || 'application/octet-stream',
      bytes: EMBEDDED_FILE_BYTES
    };
  }

  // Activity pages, course pages and everything else Moodle renders as HTML.
  const html = '<!DOCTYPE html><html><body><div id="region-main"></div></body></html>';
  return { finalUrl: url.href, contentType: 'text/html; charset=utf-8', bytes: Buffer.byteLength(html), body: html };
}

function createResponse(url, { status = 200, headers = {}, body = '' } = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)])
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: {
      get: name => normalized[String(name).toLowerCase()] ?? null,
      has: name => String(name).toLowerCase() in normalized
    },
    text: async () => body,
    body: { cancel: async () => {} }
  };
}

function createFakeMoodle() {
  const requests = [];

  async function fetch(input, options = {}) {
    const requestUrl = typeof input === 'string' ? input : (input?.url || String(input));
    const method = String(options.method || 'GET').toUpperCase();
    requests.push({ method, url: requestUrl });

    const described = describeUrl(requestUrl);
    if (!described) return createResponse(requestUrl, { status: 404 });

    const headers = { 'content-type': described.contentType };
    if (described.filename) headers['content-disposition'] = `attachment; filename="${described.filename}"`;

    const requestHeaders = Object.fromEntries(
      Object.entries(options.headers || {}).map(([name, value]) => [name.toLowerCase(), value])
    );
    if (method === 'GET' && requestHeaders.range && described.body === undefined) {
      headers['content-range'] = `bytes 0-0/${described.bytes}`;
      headers['content-length'] = '1';
      return createResponse(described.finalUrl, { status: 206, headers });
    }

    headers['content-length'] = String(described.bytes);
    return createResponse(described.finalUrl, {
      headers,
      body: method === 'HEAD' ? '' : (described.body || '')
    });
  }

  return { fetch, requests };
}

module.exports = {
  EMBEDDED_FILE_BYTES,
  MB,
  ORIGIN,
  createFakeMoodle,
  describeUrl,
  folderFiles,
  resourceFile
};
