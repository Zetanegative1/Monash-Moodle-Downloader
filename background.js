/**
 * Background Service Worker
 * 处理下载任务和资源管理
 */

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadAll') {
    handleDownloadAll(request.resources)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 保持消息通道开启
  }
});

/**
 * 处理批量下载
 */
async function handleDownloadAll(resources) {
  let downloadCount = 0;
  const downloadPromises = [];

  try {
    for (const course of resources) {
      const scanType = course.scanType || 'weekpage';
      console.log('[Background] 扫描类型:', scanType);

      for (const week of course.weeks) {
        // 章节文件夹名：有周号用 "Week N"，否则用原始名
        const folderName = week.weekNumber !== undefined
          ? `Week ${week.weekNumber}`
          : week.name;

        // courseindex：下载到 课程名/Week N/
        // weekpage：直接下载到 Week N/（不需要课程父文件夹）
        const path = scanType === 'courseindex'
          ? `${course.name}/${folderName}`
          : folderName;

        console.log('[Background] 路径:', path, '资源数:', week.resources.length);

        for (const resource of week.resources) {
          const downloadPromise = downloadResource(resource, path);
          downloadPromises.push(downloadPromise);
          downloadCount++;
        }
      }
    }

    console.log('[Background] 总共添加了', downloadCount, '个下载任务');

    // 等待所有下载任务添加完成
    await Promise.all(downloadPromises);

    return {
      success: true,
      count: downloadCount
    };

  } catch (error) {
    console.error('批量下载错误:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 下载单个资源
 */
async function downloadResource(resource, path) {
  try {
    if (resource.type === 'VIDEO') {
      // 处理视频资源
      await handleVideoResource(resource, path);
    } else if (resource.type === 'URL') {
      // 处理外部链接，生成 .url 快捷方式
      await handleUrlResource(resource, path);
    } else {
      // 普通文件下载
      await downloadFile(resource.url, resource.name, path);
    }

  } catch (error) {
    console.error(`下载资源失败 [${resource.name}]:`, error);
    // 继续处理其他资源，不中断整个流程
  }
}

/**
 * 处理视频资源
 */
async function handleVideoResource(resource, path) {
  try {
    // 检查是否是直接视频链接
    if (resource.url.match(/\.(mp4|webm|ogg|avi|mov)(\?.*)?$/i)) {
      // 直接下载视频文件
      const videoName = resource.name + '.mp4';
      await downloadFile(resource.url, videoName, path);
    } else {
      // 嵌入式播放器，生成 .url 快捷方式
      await createUrlShortcut(resource.name, resource.url, path);
    }
  } catch (error) {
    console.error('处理视频资源时出错:', error);
    throw error;
  }
}

/**
 * 处理外部链接资源
 */
async function handleUrlResource(resource, path) {
  try {
    await createUrlShortcut(resource.name, resource.url, path);
  } catch (error) {
    console.error('处理 URL 资源时出错:', error);
    throw error;
  }
}

/**
 * 下载文件
 */
async function downloadFile(url, filename, path) {
  return new Promise((resolve, reject) => {
    // 确保文件名有扩展名
    let finalFilename = filename;

    // 从 URL 中提取扩展名（如果文件名中没有）
    if (!finalFilename.includes('.')) {
      const urlMatch = url.match(/\.([a-z0-9]{3,4})(\?.*)?$/i);
      if (urlMatch) {
        finalFilename += '.' + urlMatch[1];
      }
    }

    // 构建完整路径
    const fullPath = `${path}/${finalFilename}`;

    console.log('[Background] 下载:', fullPath);

    chrome.downloads.download({
      url: url,
      filename: fullPath,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('[Background] 下载失败:', chrome.runtime.lastError);
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(downloadId);
      }
    });
  });
}

/**
 * 创建 URL 快捷方式文件 (.url 格式)
 */
async function createUrlShortcut(name, url, path) {
  const filename = `${name}.url`;
  const fullPath = `${path}/${filename}`;

  // Windows Internet Shortcut 格式
  const content = `[InternetShortcut]\r\nURL=${url}\r\n`;

  // 使用Data URL
  const base64Content = btoa(unescape(encodeURIComponent(content)));
  const dataUrl = 'data:text/plain;base64,' + base64Content;

  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: dataUrl,
      filename: fullPath,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(downloadId);
      }
    });
  });
}

/**
 * 安装时的初始化
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('Monash Moodle Downloader 已安装');

  // 创建右键菜单（可选功能）
  if (chrome.contextMenus) {
    try {
      chrome.contextMenus.create({
        id: 'downloadCourseResources',
        title: '下载课程资源',
        contexts: ['page'],
        documentUrlPatterns: ['https://learning.monash.edu/*']
      }, () => {
        if (chrome.runtime.lastError) {
          console.log('创建右键菜单失败:', chrome.runtime.lastError.message);
        } else {
          console.log('右键菜单创建成功');
        }
      });
    } catch (error) {
      console.log('创建右键菜单时出错:', error.message);
    }
  }
});

/**
 * 右键菜单点击事件
 */
if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'downloadCourseResources') {
      // 发送消息到 content script 请求扫描
      chrome.tabs.sendMessage(tab.id, {
        action: 'scanResources'
      }).then(response => {
        if (response && response.success) {
          console.log('扫描成功，找到', response.resources.length, '个课程');
          // 可选：自动触发下载或显示通知
        }
      }).catch(error => {
        console.error('扫描失败:', error.message);
      });
    }
  });
}
