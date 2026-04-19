chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadAll') {
    handleDownloadAll(request.resources)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function handleDownloadAll(resources) {
  let downloadCount = 0;
  const downloadPromises = [];

  try {
    for (const course of resources) {
      const scanType = course.scanType || 'weekpage';

      for (const week of course.weeks) {
        const folderName = week.weekNumber !== undefined ? `Week ${week.weekNumber}` : week.name;
        // courseindex: nest under course folder; weekpage: download directly to week folder
        const path = scanType === 'courseindex' ? `${course.name}/${folderName}` : folderName;

        for (const resource of week.resources) {
          downloadPromises.push(downloadResource(resource, path));
          downloadCount++;
        }
      }
    }

    await Promise.all(downloadPromises);
    return { success: true, count: downloadCount };

  } catch (error) {
    console.error('Download error:', error);
    return { success: false, error: error.message };
  }
}

async function downloadResource(resource, path) {
  try {
    if (resource.type === 'VIDEO') {
      if (resource.url.match(/\.(mp4|webm|ogg|avi|mov)(\?.*)?$/i)) {
        await downloadFile(resource.url, resource.name + '.mp4', path);
      } else {
        await createUrlShortcut(resource.name, resource.url, path);
      }
    } else if (resource.type === 'URL') {
      await createUrlShortcut(resource.name, resource.url, path);
    } else {
      await downloadFile(resource.url, resource.name, path);
    }
  } catch (error) {
    console.error(`Failed to download [${resource.name}]:`, error);
  }
}

async function downloadFile(url, filename, path) {
  return new Promise((resolve, reject) => {
    let finalFilename = filename;
    if (!finalFilename.includes('.')) {
      const ext = url.match(/\.([a-z0-9]{3,4})(\?.*)?$/i);
      if (ext) finalFilename += '.' + ext[1];
    }

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

chrome.runtime.onInstalled.addListener(() => {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.create({
    id: 'downloadCourseResources',
    title: 'Download course resources',
    contexts: ['page'],
    documentUrlPatterns: ['https://learning.monash.edu/*']
  }, () => { chrome.runtime.lastError; });
});

if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'downloadCourseResources') {
      chrome.tabs.sendMessage(tab.id, { action: 'scanResources' }).catch(() => {});
    }
  });
}
