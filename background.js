if (typeof importScripts === 'function') importScripts('lib/shared.js');

const { sanitizePathSegment, withExtension } = typeof module !== 'undefined' && module.exports
  ? require('./lib/shared.js')
  : globalThis.MoodleDownloader;

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action !== 'downloadAll') return false;

    handleDownloadAll(request.resources)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  });
}

async function handleDownloadAll(resources) {
  let skippedCount = 0;
  const downloadPromises = [];

  try {
    for (const course of resources) {
      const scanType = course.scanType || 'weekpage';

      for (const week of course.weeks) {
        const folderName = getWeekFolderName(week);
        // courseindex: nest under course folder; weekpage: download directly to week folder
        const path = scanType === 'courseindex' ? `${course.name}/${folderName}` : folderName;

        for (const resource of week.resources) {
          if (resource.downloadable === false) {
            skippedCount++;
            continue;
          }

          const resourcePath = appendFolderPath(path, resource.folderPath);
          downloadPromises.push(downloadResource(resource, resourcePath));
        }
      }
    }

    const results = await Promise.all(downloadPromises);
    const downloadCount = results.filter(Boolean).length;
    const failedCount = results.length - downloadCount;
    return { success: true, count: downloadCount, skipped: skippedCount, failed: failedCount };

  } catch (error) {
    console.error('Download error:', error);
    return { success: false, error: error.message };
  }
}

async function downloadResource(resource, path) {
  try {
    if (resource.type === 'VIDEO') {
      if (resource.url.match(/\.(mp4|webm|avi|mov|m4v|mkv|ogv|mpeg|mpg)([?#].*)?$/i)) {
        const filename = hasFileExtension(resource.name) ? resource.name : `${resource.name}.mp4`;
        await downloadFile(resource.url, filename, path);
      } else {
        await createUrlShortcut(resource.name, resource.url, path);
      }
    } else if (resource.type === 'URL') {
      await createUrlShortcut(resource.name, resource.url, path);
    } else {
      await downloadFile(resource.url, resource.name, path, resource.extension);
    }
    return true;
  } catch (error) {
    console.error(`Failed to download [${resource.name}]:`, error);
    return false;
  }
}

async function downloadFile(url, filename, path, extension) {
  return new Promise((resolve, reject) => {
    const finalFilename = withExtension(filename, extension || getDownloadableExtension(url, filename));

    chrome.downloads.download({
      url,
      filename: `${path}/${finalFilename}`,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(downloadId);
    });
  });
}

function appendFolderPath(basePath, folderPath) {
  if (!folderPath) return basePath;
  const safeSegments = String(folderPath)
    .split(/[\\/]+/)
    .map(sanitizePathSegment)
    .filter(Boolean);
  return safeSegments.length > 0 ? `${basePath}/${safeSegments.join('/')}` : basePath;
}

function getWeekFolderName(week) {
  if (week.folderName) return sanitizePathSegment(week.folderName) || 'Unknown';
  return week.weekNumber !== undefined ? `Week ${week.weekNumber}` : week.name;
}

// A Moodle script address (view.php, pluginfile.php) says nothing about the file behind it.
function getDownloadableExtension(url, filename) {
  if (hasFileExtension(filename)) return '';
  try {
    const match = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
    return match && match[1].toLowerCase() !== 'php' ? match[1] : '';
  } catch (error) {
    return '';
  }
}

function hasFileExtension(filename) {
  return /\.[a-z0-9]{1,8}$/i.test(filename || '');
}

async function createUrlShortcut(name, url, path) {
  const content = `[InternetShortcut]\r\nURL=${url}\r\n`;
  const dataUrl = 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(content)));

  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: dataUrl,
      filename: `${path}/${name}.url`,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(downloadId);
    });
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    if (!chrome.contextMenus) return;
    chrome.contextMenus.create({
      id: 'downloadCourseResources',
      title: 'Download course resources',
      contexts: ['page'],
      documentUrlPatterns: ['https://learning.monash.edu/*']
    }, () => { chrome.runtime.lastError; });
  });
}

if (typeof chrome !== 'undefined' && chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'downloadCourseResources') {
      chrome.tabs.sendMessage(tab.id, { action: 'scanResources' }).catch(() => {});
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    appendFolderPath,
    getDownloadableExtension,
    handleDownloadAll,
    hasFileExtension,
    sanitizePathSegment
  };
}
