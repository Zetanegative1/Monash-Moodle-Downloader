/**
 * Content Script - 扫描 Moodle 页面中的课程资源
 * 支持侧拉栏（courseindex）抓取和普通页面抓取
 */

console.log('[Moodle Downloader] Content Script 开始加载...');

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Moodle Downloader] 收到消息:', request.action);

  if (request.action === 'scanResources') {
    try {
      console.log('[Moodle Downloader] 开始扫描资源...');
      const resources = scanPageResources();
      console.log('[Moodle Downloader] 扫描完成，找到资源:', resources);
      sendResponse({ success: true, resources: resources });
    } catch (error) {
      console.error('[Moodle Downloader] 扫描资源时出错:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true; // 保持消息通道开启以支持异步响应
  }

  return false;
});

console.log('[Moodle Downloader] Content Script 已加载并准备就绪');

/**
 * 扫描页面资源 - 主入口
 */
function scanPageResources() {
  const resources = [];

  try {
    // 1. 获取课程名称
    const courseName = getCourseName();

    // 2. 检测页面类型并扫描
    const hasCourseIndex = document.querySelector('.courseindex');
    const isWeekPage = window.location.href.match(/section=\d+/);

    if (hasCourseIndex && !isWeekPage) {
      // Unit首页：使用侧拉栏抓取所有Week
      console.log('检测到Unit首页，使用侧拉栏抓取');
      const sections = scanFromCourseIndex();
      if (sections.length > 0) {
        resources.push({
          name: courseName,
          weeks: sections,
          scanType: 'courseindex' // 标记为侧拉栏抓取
        });
      }
    } else {
      // Week页面：使用常规抓取
      console.log('检测到Week页面，使用常规抓取');
      const sections = scanAllSections();
      if (sections.length > 0) {
        resources.push({
          name: courseName,
          weeks: sections,
          scanType: 'weekpage' // 标记为周次页面抓取
        });
      }
    }

  } catch (error) {
    console.error('扫描页面资源时出错:', error);
  }

  return resources;
}

/**
 * 从侧拉栏（courseindex）扫描资源
 * 基于 DOM 树结构：定位 Learning 容器 → 每个直接子 section 作为一个 Week
 * 子 section 内的所有 cm_name（含 Own-time/Real-time 子子章节）全部扁平收集到该 Week 下
 */
function scanFromCourseIndex() {
  const processedUrls = new Set();

  try {
    console.log('[侧拉栏扫描] 开始扫描...');

    // 定位周章节所在容器
    const weekContainer = findWeekContainer();
    if (!weekContainer) {
      console.log('[侧拉栏扫描] ✗ 未找到侧栏章节容器');
      return [];
    }

    // 取直接子 section（每个就是一周 / 或 Additional resources 等同级内容）
    const weekSections = Array.from(weekContainer.children)
      .filter(el => el.classList && el.classList.contains('courseindex-section'));

    console.log('[侧拉栏扫描] 直接子章节数:', weekSections.length);

    const results = [];

    weekSections.forEach(sec => {
      const titleLink = sec.querySelector(':scope > .courseindex-item .courseindex-link[data-for="section_title"]')
                     || sec.querySelector('.courseindex-link[data-for="section_title"]');
      if (!titleLink) return;
      const title = titleLink.textContent?.trim();
      if (!title) return;

      // 扁平收集该章节下所有 cm_name（跨 Own-time/Real-time 子章节）
      const cmLinks = sec.querySelectorAll('.courseindex-link[data-for="cm_name"]');
      const resources = [];
      cmLinks.forEach(link => {
        const info = extractResourceFromLink(link, processedUrls);
        if (info) resources.push(info);
      });

      if (resources.length === 0) {
        console.log(`[侧拉栏扫描] - 跳过空章节: ${title}`);
        return;
      }

      const weekNum = extractWeekNumber(title);
      results.push({
        name: sanitizeFileName(title),
        weekNumber: weekNum || undefined,
        resources
      });
      console.log(`[侧拉栏扫描] ✓ ${title} (Week ${weekNum || '—'}): ${resources.length} 个资源`);
    });

    // 排序：有周号的按周号，其他保持原序放后面
    results.sort((a, b) => {
      const aw = a.weekNumber ?? Infinity;
      const bw = b.weekNumber ?? Infinity;
      return aw - bw;
    });

    return results;

  } catch (error) {
    console.error('[侧拉栏扫描] 扫描时出错:', error);
    return [];
  }
}

/**
 * 定位包含周章节的容器：
 *  1. 首选：Learning section 的 children 容器
 *  2. 次选：任意 "Week N" section 的父容器
 *  3. 兜底：.courseindex 根
 */
function findWeekContainer() {
  const titleLinks = document.querySelectorAll('.courseindex-link[data-for="section_title"]');

  // 1. Learning 板块
  for (const link of titleLinks) {
    if (/^\s*Learning\s*$/i.test(link.textContent || '')) {
      const learningSection = link.closest('.courseindex-section');
      if (learningSection) {
        const childrenWrap = learningSection.querySelector(
          ':scope > .courseindex-item-content .courseindex-sectioncontent-children'
        ) || learningSection.querySelector('.courseindex-sectioncontent-children');
        if (childrenWrap) {
          console.log('[侧拉栏扫描] ✓ 使用 Learning 容器');
          return childrenWrap;
        }
      }
    }
  }

  // 2. 任意 Week N 的父容器
  for (const link of titleLinks) {
    if (/week\s*\d+/i.test(link.textContent || '')) {
      const section = link.closest('.courseindex-section');
      const parentContainer = section?.parentElement;
      if (parentContainer && parentContainer.classList.contains('courseindex-sectioncontent-children')) {
        console.log('[侧拉栏扫描] ✓ 通过 Week 锚定父容器');
        return parentContainer;
      }
    }
  }

  // 3. 兜底
  const root = document.querySelector('.courseindex');
  if (root) console.log('[侧拉栏扫描] ✓ 使用 courseindex 根容器作兜底');
  return root;
}

/**
 * 提取Week编号
 */
function extractWeekNumber(weekName) {
  const match = weekName.match(/week\s*(\d+)/i);
  return match ? parseInt(match[1]) : 0;
}

/**
 * 从链接提取资源信息（侧拉栏版本）
 */
function extractResourceFromLink(link, processedUrls) {
  const url = link.href;
  const text = link.textContent?.trim() || '';

  console.log('[提取资源] URL:', url.substring(0, 60) + '...');
  console.log('[提取资源] 文本:', text);

  if (!url) {
    console.log('[提取资源] ✗ URL为空');
    return null;
  }

  if (processedUrls.has(url)) {
    console.log('[提取资源] ✗ URL已处理');
    return null;
  }

  let type = 'FILE';
  let downloadUrl = url;
  const lowerUrl = url.toLowerCase();

  // 确定资源类型
  if (url.includes('panopto') || url.includes('lti') || lowerUrl.includes('video')) {
    type = 'VIDEO';
  } else if (url.includes('/mod/url/view.php')) {
    type = 'URL';
  } else if (url.includes('/mod/resource/view.php')) {
    // Moodle 资源：需要找到真实的下载链接
    // 尝试从 URL 中提取资源 ID
    const urlMatch = url.match(/id=(\d+)/);
    if (urlMatch) {
      const resourceId = urlMatch[1];
      console.log('[提取资源] 这是Moodle资源，ID:', resourceId);

      // 尝试在页面中查找对应的真实下载链接
      const realLink = findRealResourceLink(resourceId, text);
      if (realLink) {
        downloadUrl = realLink;
        console.log('[提取资源] ✓ 找到真实链接:', downloadUrl.substring(0, 60) + '...');
      } else {
        console.log('[提取资源] ⚠ 未找到真实链接，使用原始URL');
      }
    }
  }

  // 根据URL确定文件类型
  if (lowerUrl.includes('.pdf') || downloadUrl.toLowerCase().includes('.pdf')) {
    type = 'PDF';
  } else if (lowerUrl.includes('.ppt') || lowerUrl.includes('.pptx')) {
    type = 'PPT';
  } else if (lowerUrl.includes('.doc') || lowerUrl.includes('.docx')) {
    type = 'DOC';
  } else if (lowerUrl.includes('.mp4')) {
    type = 'VIDEO';
  }

  processedUrls.add(url);

  console.log('[提取资源] ✓ 类型:', type, '下载URL:', downloadUrl.substring(0, 60) + '...');

  return {
    name: sanitizeFileName(text),
    type: type,
    url: downloadUrl,
    originalUrl: url
  };
}

/**
 * 在页面中查找真实的资源下载链接
 */
function findRealResourceLink(resourceId, resourceName) {
  try {
    // 方法1：查找 data-content-id 匹配的链接
    const contentLinks = document.querySelectorAll('a[href*="/mod_resource/content/"]');
    for (const link of contentLinks) {
      const href = link.href;
      if (href.includes(`resource/content/${resourceId}`) || link.getAttribute('data-content-id') === resourceId) {
        console.log('[查找真实链接] ✓ 通过content属性找到');
        return href;
      }
    }

    // 方法2：在 .activityinstance 中查找包含资源ID的链接
    const activities = document.querySelectorAll('.activityinstance');
    for (const activity of activities) {
      const link = activity.querySelector('a[href*="/mod_resource/content/"]');
      if (link) {
        const href = link.href;
        // 检查链接是否包含当前资源ID
        const activityResourceId = activity.closest('li')?.getAttribute('data-id');
        if (activityResourceId === resourceId || href.includes(`/content/${resourceId}/`)) {
          console.log('[查找真实链接] ✓ 通过activity找到');
          return href;
        }
      }
    }

    console.log('[查找真实链接] ✗ 未找到匹配的真实链接');
    return null;

  } catch (error) {
    console.error('[查找真实链接] 出错:', error);
    return null;
  }
}

/**
 * 获取课程名称（返回完整 h1 标题）
 */
function getCourseName() {
  // 优先使用 h1 完整标题
  const h1 = document.querySelector('h1');
  if (h1) {
    const text = h1.textContent?.trim();
    if (text && text.length > 0) {
      return sanitizeFileName(text);
    }
  }

  // 备用选择器
  const selectors = ['.page-context-header', '.course-title', '[data-region="course-title"]'];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const text = el?.textContent?.trim();
    if (text) return sanitizeFileName(text);
  }

  // 最后从 title 提取课程代码
  const titleMatch = document.title.match(/[A-Z]{4}\d{4}/);
  return titleMatch ? titleMatch[0] : 'Course';
}

/**
 * 扫描所有课程章节（Week页面使用）
 */
function scanAllSections() {
  const sections = [];
  const processedUrls = new Set();

  try {
    const sectionElements = document.querySelectorAll('li[data-sectionid], .course-section, [data-section-id]');

    sectionElements.forEach(sectionEl => {
      const sectionName = extractSectionName(sectionEl);

      if (!sectionName || sectionName === 'Section_null') {
        return;
      }

      const sectionResources = scanResourcesInSection(sectionEl, processedUrls);

      if (sectionResources.length > 0) {
        const weekNum = extractWeekNumber(sectionName);
        sections.push({
          name: sanitizeFileName(sectionName),
          weekNumber: weekNum || undefined,
          resources: sectionResources
        });
      }
    });

  } catch (error) {
    console.error('扫描章节时出错:', error);
  }

  return sections;
}

/**
 * 提取章节名称
 */
function extractSectionName(sectionEl) {
  const nameSelectors = [
    '.sectionname',
    'h3',
    'h4',
    '.section-header',
    '[aria-label]'
  ];

  for (const selector of nameSelectors) {
    const nameEl = sectionEl.querySelector(selector);
    if (nameEl) {
      const ariaLabel = nameEl.getAttribute('aria-label');
      if (ariaLabel) {
        return ariaLabel.trim();
      }
      const text = nameEl.textContent?.trim();
      if (text && text.length > 0 && text.length < 100) {
        return text;
      }
    }
  }

  const sectionId = sectionEl.getAttribute('data-sectionid') ||
                   sectionEl.getAttribute('data-section-id');
  if (sectionId) {
    return `Section_${sectionId}`;
  }

  return null;
}

/**
 * 扫描章节中的资源
 */
function scanResourcesInSection(sectionEl, processedUrls) {
  const resources = [];

  try {
    const activityLinks = sectionEl.querySelectorAll(
      '.activityinstance a, ' +
      'a[href*="/mod/resource/"], ' +
      'a[href*="/mod/folder/"], ' +
      'a[href*="/mod/url/"], ' +
      'a[href*="/mod/page/"], ' +
      'a.activityname'
    );

    activityLinks.forEach(link => {
      try {
        const url = link.href;

        if (!url || processedUrls.has(url)) {
          return;
        }

        const resourceInfo = extractResourceInfoFromLink(link);

        if (resourceInfo && resourceInfo.name && resourceInfo.name !== 'Unknown Resource') {
          processedUrls.add(url);
          resources.push(resourceInfo);
        }

      } catch (error) {
        // 忽略单个资源的错误
      }
    });

  } catch (error) {
    console.error('扫描章节资源时出错:', error);
  }

  return resources;
}

/**
 * 从链接提取资源信息（Week页面版本）
 */
function extractResourceInfoFromLink(link) {
  const url = link.href;
  let name = '';
  let type = 'FILE';
  let downloadUrl = url;

  const nameSelectors = [
    '.instancename',
    '.activityname',
    '[data-region="activity-name"]'
  ];

  for (const selector of nameSelectors) {
    const nameEl = link.closest('.activityinstance')?.querySelector(selector) ||
                  link.querySelector(selector);
    if (nameEl) {
      name = nameEl.textContent?.trim() || '';
      name = name.replace(/\s*(File|PDF|PowerPoint|Word|Video|Folder)\s*$/gi, '').trim();
      if (name) break;
    }
  }

  if (!name) {
    name = link.textContent?.trim() || link.getAttribute('title') || '';
  }

  name = name.trim().substring(0, 150);

  if (!name) {
    return null;
  }

  const lowerUrl = url.toLowerCase();

  if (url.includes('panopto') || url.includes('lti') || lowerUrl.includes('video') || lowerUrl.includes('media')) {
    type = 'VIDEO';
  } else if (url.includes('/mod/url/view.php')) {
    type = 'URL';
  } else {
    if (lowerUrl.includes('.pdf') || lowerUrl.includes('pdf')) {
      type = 'PDF';
    } else if (lowerUrl.includes('.ppt') || lowerUrl.includes('.pptx')) {
      type = 'PPT';
    } else if (lowerUrl.includes('.doc') || lowerUrl.includes('.docx')) {
      type = 'DOC';
    } else if (lowerUrl.includes('.mp4') || lowerUrl.includes('.webm') || lowerUrl.includes('.avi')) {
      type = 'VIDEO';
    }

    const resourceLink = link.closest('li')?.querySelector('a[href*="/mod_resource/content/"]');
    if (resourceLink) {
      downloadUrl = resourceLink.href;
    }
  }

  return {
    name: sanitizeFileName(name),
    type: type,
    url: downloadUrl,
    originalUrl: url
  };
}

/**
 * 清理文件名
 */
function sanitizeFileName(name) {
  if (!name) return 'Unknown';

  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^,|,$/g, '')
    .substring(0, 200);
}

console.log('Moodle Downloader Content Script v3 已加载（支持侧拉栏抓取）');
