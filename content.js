chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scanResources') {
    try {
      sendResponse({ success: true, resources: scanPageResources() });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }
  return false;
});

function scanPageResources() {
  const resources = [];
  const courseName = getCourseName();
  const hasCourseIndex = document.querySelector('.courseindex');
  const isWeekPage = window.location.href.match(/section=\d+/);

  if (hasCourseIndex && !isWeekPage) {
    const sections = scanFromCourseIndex();
    if (sections.length > 0) {
      resources.push({ name: courseName, weeks: sections, scanType: 'courseindex' });
    }
  } else {
    const sections = scanAllSections();
    if (sections.length > 0) {
      resources.push({ name: courseName, weeks: sections, scanType: 'weekpage' });
    }
  }

  return resources;
}

// Walks the courseindex sidebar tree. Finds the Learning container,
// then treats each direct child section as a week, collecting all
// cm_name links recursively (flattens Own-time / Real-time subgroups).
function scanFromCourseIndex() {
  const processedUrls = new Set();

  const weekContainer = findWeekContainer();
  if (!weekContainer) return [];

  const weekSections = Array.from(weekContainer.children)
    .filter(el => el.classList && el.classList.contains('courseindex-section'));

  const results = [];

  weekSections.forEach(sec => {
    const titleLink = sec.querySelector(':scope > .courseindex-item .courseindex-link[data-for="section_title"]')
                   || sec.querySelector('.courseindex-link[data-for="section_title"]');
    if (!titleLink) return;
    const title = titleLink.textContent?.trim();
    if (!title) return;

    const cmLinks = sec.querySelectorAll('.courseindex-link[data-for="cm_name"]');
    const resources = [];
    cmLinks.forEach(link => {
      const info = extractResourceFromLink(link, processedUrls);
      if (info) resources.push(info);
    });

    if (resources.length === 0) return;

    const weekNum = extractWeekNumber(title);
    results.push({ name: sanitizeFileName(title), weekNumber: weekNum || undefined, resources });
  });

  results.sort((a, b) => (a.weekNumber ?? Infinity) - (b.weekNumber ?? Infinity));
  return results;
}

function findWeekContainer() {
  const titleLinks = document.querySelectorAll('.courseindex-link[data-for="section_title"]');

  for (const link of titleLinks) {
    if (/^\s*Learning\s*$/i.test(link.textContent || '')) {
      const section = link.closest('.courseindex-section');
      if (section) {
        const wrap = section.querySelector(':scope > .courseindex-item-content .courseindex-sectioncontent-children')
                  || section.querySelector('.courseindex-sectioncontent-children');
        if (wrap) return wrap;
      }
    }
  }

  for (const link of titleLinks) {
    if (/week\s*\d+/i.test(link.textContent || '')) {
      const section = link.closest('.courseindex-section');
      const parent = section?.parentElement;
      if (parent?.classList.contains('courseindex-sectioncontent-children')) return parent;
    }
  }

  return document.querySelector('.courseindex');
}

function extractWeekNumber(name) {
  const match = name.match(/week\s*(\d+)/i);
  return match ? parseInt(match[1]) : 0;
}

function extractResourceFromLink(link, processedUrls) {
  const url = link.href;
  const text = link.textContent?.trim() || '';

  if (!url || processedUrls.has(url)) return null;

  let type = 'FILE';
  let downloadUrl = url;
  const lowerUrl = url.toLowerCase();

  if (url.includes('panopto') || url.includes('lti') || lowerUrl.includes('video')) {
    type = 'VIDEO';
  } else if (url.includes('/mod/url/view.php')) {
    type = 'URL';
  } else if (url.includes('/mod/resource/view.php')) {
    const idMatch = url.match(/id=(\d+)/);
    if (idMatch) {
      const realLink = findRealResourceLink(idMatch[1]);
      if (realLink) downloadUrl = realLink;
    }
  }

  if (lowerUrl.includes('.pdf') || downloadUrl.toLowerCase().includes('.pdf')) type = 'PDF';
  else if (lowerUrl.includes('.ppt') || lowerUrl.includes('.pptx')) type = 'PPT';
  else if (lowerUrl.includes('.doc') || lowerUrl.includes('.docx')) type = 'DOC';
  else if (lowerUrl.includes('.mp4')) type = 'VIDEO';

  processedUrls.add(url);
  return { name: sanitizeFileName(text), type, url: downloadUrl, originalUrl: url };
}

// Moodle resource links point to /mod/resource/view.php — this resolves the actual file URL.
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
      if (link) {
        const activityId = activity.closest('li')?.getAttribute('data-id');
        if (activityId === resourceId || link.href.includes(`/content/${resourceId}/`)) {
          return link.href;
        }
      }
    }
  } catch (e) {}
  return null;
}

function getCourseName() {
  const h1 = document.querySelector('h1');
  if (h1?.textContent?.trim()) return sanitizeFileName(h1.textContent.trim());

  for (const sel of ['.page-context-header', '.course-title', '[data-region="course-title"]']) {
    const text = document.querySelector(sel)?.textContent?.trim();
    if (text) return sanitizeFileName(text);
  }

  const match = document.title.match(/[A-Z]{4}\d{4}/);
  return match ? match[0] : 'Course';
}

function scanAllSections() {
  const sections = [];
  const processedUrls = new Set();

  document.querySelectorAll('li[data-sectionid], .course-section, [data-section-id]').forEach(sectionEl => {
    const sectionName = extractSectionName(sectionEl);
    if (!sectionName || sectionName === 'Section_null') return;

    const sectionResources = scanResourcesInSection(sectionEl, processedUrls);
    if (sectionResources.length > 0) {
      const weekNum = extractWeekNumber(sectionName);
      sections.push({ name: sanitizeFileName(sectionName), weekNumber: weekNum || undefined, resources: sectionResources });
    }
  });

  return sections;
}

function extractSectionName(sectionEl) {
  for (const sel of ['.sectionname', 'h3', 'h4', '.section-header', '[aria-label]']) {
    const el = sectionEl.querySelector(sel);
    if (!el) continue;
    const label = el.getAttribute('aria-label');
    if (label) return label.trim();
    const text = el.textContent?.trim();
    if (text && text.length < 100) return text;
  }

  const id = sectionEl.getAttribute('data-sectionid') || sectionEl.getAttribute('data-section-id');
  return id ? `Section_${id}` : null;
}

function scanResourcesInSection(sectionEl, processedUrls) {
  const resources = [];

  sectionEl.querySelectorAll(
    '.activityinstance a, a[href*="/mod/resource/"], a[href*="/mod/folder/"], a[href*="/mod/url/"], a[href*="/mod/page/"], a.activityname'
  ).forEach(link => {
    const url = link.href;
    if (!url || processedUrls.has(url)) return;

    const info = extractResourceInfoFromLink(link);
    if (info?.name && info.name !== 'Unknown Resource') {
      processedUrls.add(url);
      resources.push(info);
    }
  });

  return resources;
}

function extractResourceInfoFromLink(link) {
  const url = link.href;
  let name = '';
  let type = 'FILE';
  let downloadUrl = url;

  for (const sel of ['.instancename', '.activityname', '[data-region="activity-name"]']) {
    const el = link.closest('.activityinstance')?.querySelector(sel) || link.querySelector(sel);
    if (el) {
      name = el.textContent?.trim().replace(/\s*(File|PDF|PowerPoint|Word|Video|Folder)\s*$/gi, '').trim();
      if (name) break;
    }
  }

  if (!name) name = link.textContent?.trim() || link.getAttribute('title') || '';
  name = name.trim().substring(0, 150);
  if (!name) return null;

  const lowerUrl = url.toLowerCase();

  if (url.includes('panopto') || url.includes('lti') || lowerUrl.includes('video') || lowerUrl.includes('media')) {
    type = 'VIDEO';
  } else if (url.includes('/mod/url/view.php')) {
    type = 'URL';
  } else {
    if (lowerUrl.includes('.pdf')) type = 'PDF';
    else if (lowerUrl.includes('.ppt') || lowerUrl.includes('.pptx')) type = 'PPT';
    else if (lowerUrl.includes('.doc') || lowerUrl.includes('.docx')) type = 'DOC';
    else if (lowerUrl.includes('.mp4') || lowerUrl.includes('.webm') || lowerUrl.includes('.avi')) type = 'VIDEO';

    const resourceLink = link.closest('li')?.querySelector('a[href*="/mod_resource/content/"]');
    if (resourceLink) downloadUrl = resourceLink.href;
  }

  return { name: sanitizeFileName(name), type, url: downloadUrl, originalUrl: url };
}

function sanitizeFileName(name) {
  if (!name) return 'Unknown';
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 200);
}
