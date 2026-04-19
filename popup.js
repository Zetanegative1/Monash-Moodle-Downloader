const TRANSLATIONS = {
  en: {
    title: 'Moodle Downloader',
    scanBtn: 'Scan',
    downloadBtn: 'Download All',
    clearBtn: 'Clear',
    statCourses: 'Courses',
    statWeeks: 'Weeks',
    statResources: 'Files',
    loading: 'Scanning page resources...',
    emptyTitle: 'No resources scanned yet',
    emptyHint1: 'On a Unit Dashboard: downloads every published file across all weeks.',
    emptyHint2: 'On a single Week page: downloads only that week\u2019s resources.',
    scanTypeIndex: '📚 Unit Homepage (All Sections)',
    scanTypePage: '📖 Week Page (Current Section)',
    pathIndex: '📁 Path: Downloads/{course}/Week 1/, Week 2/, ...',
    pathPage: '📁 Path: Downloads/Week N/filename',
    statusInit: 'Initializing...',
    statusFound: 'Scan complete! Found {n} course(s)',
    statusNone: 'No resources found',
    statusScanFail: 'Scan failed: ',
    statusDownloading: 'Starting download...',
    statusDownloaded: 'Added {n} download task(s)',
    statusDownloadFail: 'Download failed: ',
    statusCleared: 'List cleared',
    statusNotMoodle: 'Please use this extension on Monash Moodle',
    statusNoResources: 'No resources to download',
    resourceCount: '{n} files',
  },
  zh: {
    title: 'Moodle 下载器',
    scanBtn: '扫描资源',
    downloadBtn: '一键下载',
    clearBtn: '清空',
    statCourses: '课程',
    statWeeks: '周次',
    statResources: '资源',
    loading: '正在扫描页面资源...',
    emptyTitle: '尚未扫描任何资源',
    emptyHint1: '在 Unit Dashboard 页使用：一次性下载全部已发布的周次资源。',
    emptyHint2: '在单个 Week 页面使用：仅下载当前周的资源。',
    scanTypeIndex: '📚 Unit首页（全部章节）',
    scanTypePage: '📖 Week页面（当前章节）',
    pathIndex: '📁 路径: Downloads/{course}/Week 1/, Week 2/, ...',
    pathPage: '📁 路径: Downloads/Week N/文件名',
    statusInit: '正在初始化...',
    statusFound: '扫描完成！找到 {n} 个课程',
    statusNone: '未找到任何课程资源',
    statusScanFail: '扫描失败: ',
    statusDownloading: '开始下载...',
    statusDownloaded: '已添加 {n} 个下载任务',
    statusDownloadFail: '下载失败: ',
    statusCleared: '列表已清空',
    statusNotMoodle: '请在 Monash Moodle 页面使用此扩展',
    statusNoResources: '没有可下载的资源',
    resourceCount: '{n} 个资源',
  }
};

let currentLang = localStorage.getItem('moodle-dl-lang') || 'en';

function t(key, vars = {}) {
  let str = TRANSLATIONS[currentLang][key] ?? TRANSLATIONS.en[key] ?? key;
  Object.entries(vars).forEach(([k, v]) => { str = str.replace(`{${k}}`, v); });
  return str;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.getElementById('langToggle').textContent = currentLang === 'en' ? '中文' : 'EN';
}

function toggleLang() {
  currentLang = currentLang === 'en' ? 'zh' : 'en';
  localStorage.setItem('moodle-dl-lang', currentLang);
  applyTranslations();
  if (scannedResources?.length > 0) {
    renderResources(scannedResources);
    updateStats(scannedResources);
  }
}

let scannedResources = null;

const scanBtn = document.getElementById('scanBtn');
const downloadBtn = document.getElementById('downloadBtn');
const clearBtn = document.getElementById('clearBtn');
const loadingSpinner = document.getElementById('loadingSpinner');
const resultsContainer = document.getElementById('resultsContainer');
const emptyState = document.getElementById('emptyState');
const statusMessage = document.getElementById('statusMessage');
const statsSection = document.getElementById('statsSection');
const courseCountEl = document.getElementById('courseCount');
const weekCountEl = document.getElementById('weekCount');
const resourceCountEl = document.getElementById('resourceCount');

function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message show ${type}`;
  setTimeout(() => statusMessage.classList.remove('show'), 3000);
}

function updateStats(resources) {
  if (!resources?.length) { statsSection.style.display = 'none'; return; }
  let totalWeeks = 0, totalResources = 0;
  resources.forEach(course => {
    totalWeeks += course.weeks.length;
    course.weeks.forEach(week => { totalResources += week.resources.length; });
  });
  courseCountEl.textContent = resources.length;
  weekCountEl.textContent = totalWeeks;
  resourceCountEl.textContent = totalResources;
  statsSection.style.display = 'flex';
}

function getResourceIcon(type) {
  return { PDF: '📄', PPT: '📊', DOC: '📝', VIDEO: '🎥', URL: '🔗' }[type] || '📎';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderResources(resources) {
  resultsContainer.innerHTML = '';

  if (!resources?.length) {
    emptyState.style.display = 'flex';
    downloadBtn.disabled = true;
    return;
  }

  emptyState.style.display = 'none';
  downloadBtn.disabled = false;

  const course0 = resources[0];
  const scanType0 = course0.scanType || 'weekpage';
  const pathInfoDiv = document.createElement('div');
  pathInfoDiv.className = 'path-info';
  pathInfoDiv.textContent = t(scanType0 === 'courseindex' ? 'pathIndex' : 'pathPage', { course: course0.name });
  resultsContainer.appendChild(pathInfoDiv);

  resources.forEach(course => {
    const scanType = course.scanType || 'weekpage';
    const courseItem = document.createElement('div');
    courseItem.className = 'course-item';

    const courseHeader = document.createElement('div');
    courseHeader.className = 'course-header';
    courseHeader.innerHTML = `<span>${escapeHtml(course.name)}</span><span class="course-toggle">▼</span>`;

    const badge = document.createElement('div');
    badge.className = 'scan-type-badge';
    badge.textContent = t(scanType === 'courseindex' ? 'scanTypeIndex' : 'scanTypePage');
    courseHeader.appendChild(badge);

    const weekContainer = document.createElement('div');
    weekContainer.className = 'week-container';

    course.weeks.forEach(week => {
      const weekDisplayName = (week.weekNumber !== undefined && scanType === 'courseindex')
        ? `Week ${week.weekNumber}` : week.name;

      const weekItem = document.createElement('div');
      weekItem.className = 'week-item';

      const weekHeader = document.createElement('div');
      weekHeader.className = 'week-header';
      weekHeader.innerHTML = `
        <span>${escapeHtml(weekDisplayName)}</span>
        <span style="font-size:11px;color:#888">${t('resourceCount', { n: week.resources.length })}</span>
      `;

      const weekContent = document.createElement('div');
      weekContent.className = 'week-content';

      const list = document.createElement('ul');
      list.className = 'resource-list';

      week.resources.forEach(resource => {
        const item = document.createElement('li');
        item.className = 'resource-item';
        item.innerHTML = `
          <span class="resource-icon">${getResourceIcon(resource.type)}</span>
          <span class="resource-name" title="${escapeHtml(resource.name)}">${escapeHtml(resource.name)}</span>
          <span class="resource-type ${resource.type.toLowerCase()}">${resource.type}</span>
        `;
        list.appendChild(item);
      });

      weekContent.appendChild(list);
      weekItem.appendChild(weekHeader);
      weekItem.appendChild(weekContent);
      weekContainer.appendChild(weekItem);
      weekHeader.addEventListener('click', () => weekContent.classList.toggle('show'));
    });

    courseItem.appendChild(courseHeader);
    courseItem.appendChild(weekContainer);
    resultsContainer.appendChild(courseItem);

    courseHeader.addEventListener('click', e => {
      if (e.target === badge) return;
      courseHeader.querySelector('.course-toggle').classList.toggle('expanded');
      weekContainer.style.display = weekContainer.style.display === 'none' ? 'block' : 'none';
    });
  });

  document.querySelectorAll('.week-content').forEach(el => el.classList.add('show'));
}

async function scanResources() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url.includes('learning.monash.edu')) {
      showStatus(t('statusNotMoodle'), 'error');
      return;
    }

    loadingSpinner.style.display = 'flex';
    emptyState.style.display = 'none';
    resultsContainer.innerHTML = '';
    scanBtn.disabled = true;

    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { action: 'scanResources' });
    } catch {
      showStatus(t('statusInit'), 'info');
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await new Promise(r => setTimeout(r, 500));
      response = await chrome.tabs.sendMessage(tab.id, { action: 'scanResources' });
    }

    if (response?.success) {
      scannedResources = response.resources;
      if (scannedResources?.length > 0) {
        renderResources(scannedResources);
        updateStats(scannedResources);
        showStatus(t('statusFound', { n: scannedResources.length }), 'success');
      } else {
        showStatus(t('statusNone'), 'error');
        emptyState.style.display = 'flex';
      }
    } else {
      showStatus(t('statusScanFail') + (response?.error || ''), 'error');
      emptyState.style.display = 'flex';
    }
  } catch (error) {
    showStatus(t('statusScanFail') + error.message, 'error');
    emptyState.style.display = 'flex';
  } finally {
    loadingSpinner.style.display = 'none';
    scanBtn.disabled = false;
  }
}

async function downloadAll() {
  if (!scannedResources?.length) { showStatus(t('statusNoResources'), 'error'); return; }
  try {
    downloadBtn.disabled = true;
    showStatus(t('statusDownloading'), 'info');
    const response = await chrome.runtime.sendMessage({ action: 'downloadAll', resources: scannedResources });
    showStatus(response.success
      ? t('statusDownloaded', { n: response.count })
      : t('statusDownloadFail') + response.error,
      response.success ? 'success' : 'error');
  } catch (error) {
    showStatus(t('statusDownloadFail') + error.message, 'error');
  } finally {
    downloadBtn.disabled = false;
  }
}

function clearList() {
  scannedResources = null;
  resultsContainer.innerHTML = '';
  emptyState.style.display = 'flex';
  statsSection.style.display = 'none';
  downloadBtn.disabled = true;
  showStatus(t('statusCleared'), 'info');
}

scanBtn.addEventListener('click', scanResources);
downloadBtn.addEventListener('click', downloadAll);
clearBtn.addEventListener('click', clearList);
document.getElementById('langToggle').addEventListener('click', toggleLang);

document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
  downloadBtn.disabled = !scannedResources?.length;
  if (scannedResources?.length > 0) {
    renderResources(scannedResources);
    updateStats(scannedResources);
  }
});

applyTranslations();
