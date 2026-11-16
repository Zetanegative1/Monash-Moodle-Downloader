const FILE_GROUPS = [
  { id: 'pdf', icon: '📄', extensions: 'PDF' },
  { id: 'presentation', icon: '📊', extensions: 'PPT, PPTX, PPS, ODP, KEY' },
  { id: 'document', icon: '📝', extensions: 'DOC, DOCX, ODT, RTF, TXT, EPUB, HTML, JSON…' },
  { id: 'spreadsheet', icon: '📈', extensions: 'XLS, XLSX, XLSM, ODS, CSV, TSV' },
  { id: 'video', icon: '🎥', extensions: 'MP4, WEBM, MOV, AVI, MKV, MPEG…' },
  { id: 'audio', icon: '🎵', extensions: 'MP3, M4A, WAV, FLAC, AAC, OGG…' },
  { id: 'image', icon: '🖼️', extensions: 'JPG, PNG, GIF, WEBP, SVG, TIFF…' },
  { id: 'archive', icon: '🗜️', extensions: 'ZIP, RAR, 7Z, TAR, GZ…' },
  { id: 'link', icon: '🔗', extensions: '.URL shortcuts and external links' },
  { id: 'other', icon: '📎', extensions: 'Unrecognised or extensionless files' }
];

const TRANSLATIONS = {
  en: {
    title: 'Moodle Downloader',
    settingsTitle: 'Settings',
    scanBtn: 'Scan',
    downloadBtn: 'Download All',
    clearBtn: 'Clear',
    statWeeks: 'Weeks',
    statResources: 'Files',
    statSkipped: 'Skipped',
    loading: 'Scanning page resources...',
    loadingFolders: 'Opening Moodle folders and assignments ({current}/{total})...',
    loadingSizes: 'Checking file details ({current}/{total})...',
    emptyTitle: 'No resources scanned yet',
    emptyHint1: 'On a Unit Dashboard: downloads every published file across all weeks.',
    emptyHint2: 'On a single Week page: downloads only that week\u2019s resources.',
    scanTypeIndex: '📚 Unit Homepage (All Sections)',
    scanTypePage: '📖 Section Page (Current Section)',
    pathIndex: '📁 Path: Downloads/{course}/<section>/filename',
    pathPage: '📁 Path: Downloads/<section>/filename',
    statusInit: 'Initializing...',
    statusFound: 'Scan complete: {n} files, {skipped} skipped',
    statusFoundWarnings: 'Scan complete with {n} warning(s)',
    statusNone: 'No resources found',
    statusScanFail: 'Scan failed: ',
    statusDownloading: 'Starting download...',
    statusDownloaded: 'Added {n} download(s); skipped {skipped}; failed {failed}',
    statusDownloadFail: 'Download failed: ',
    statusCleared: 'List cleared',
    statusNotMoodle: 'Please use this extension on Monash Moodle',
    statusNoResources: 'No resources to download',
    resourceCount: '{n} files',
    resourceSummary: '{n} files · {skipped} skipped',
    sizeUnknown: 'Size unknown',
    sizeOverLimit: 'Over size limit',
    typeExcluded: 'Excluded in settings',
    folderWarnings: '{n} Moodle folder(s) or assignment(s) could not be fully opened; files may be missing or shown as a ZIP fallback.',
    backTitle: 'Back to downloader',
    sizeTitle: 'Maximum file size',
    sizeDescription: 'The limit applies to each file. Unknown-size files are skipped when a limit is enabled.',
    unlimited: 'Unlimited',
    unlimitedHint: 'Fastest scan; no size checks',
    typesTitle: 'File types to download',
    typesDescription: 'Unchecked groups remain visible in scan results but are skipped.',
    selectAll: 'Select all',
    clearAll: 'Clear all',
    reset: 'Restore defaults',
    save: 'Save settings',
    saved: 'Settings saved. New scans will use them.',
    resetDone: 'Defaults restored.',
    group_pdf: 'PDF documents',
    group_presentation: 'Presentations',
    group_document: 'Documents and text',
    group_spreadsheet: 'Spreadsheets and data',
    group_video: 'Video',
    group_audio: 'Audio',
    group_image: 'Images',
    group_archive: 'Archives',
    group_link: 'Links and shortcuts',
    group_other: 'Other files',
  },
  zh: {
    title: 'Moodle 下载器',
    settingsTitle: '设置',
    scanBtn: '扫描资源',
    downloadBtn: '一键下载',
    clearBtn: '清空',
    statWeeks: '周次',
    statResources: '资源',
    statSkipped: '跳过',
    loading: '正在扫描页面资源...',
    loadingFolders: '正在展开 Moodle 文件夹和作业（{current}/{total}）...',
    loadingSizes: '正在检测文件类型与大小（{current}/{total}）...',
    emptyTitle: '尚未扫描任何资源',
    emptyHint1: '在 Unit Dashboard 页使用：一次性下载全部已发布的周次资源。',
    emptyHint2: '在单个 Week 页面使用：仅下载当前周的资源。',
    scanTypeIndex: '📚 Unit首页（全部章节）',
    scanTypePage: '📖 章节页面（当前章节）',
    pathIndex: '📁 路径: Downloads/{course}/<章节>/文件名',
    pathPage: '📁 路径: Downloads/<章节>/文件名',
    statusInit: '正在初始化...',
    statusFound: '扫描完成：{n} 个文件，跳过 {skipped} 个',
    statusFoundWarnings: '扫描完成，但有 {n} 个警告',
    statusNone: '未找到任何课程资源',
    statusScanFail: '扫描失败: ',
    statusDownloading: '开始下载...',
    statusDownloaded: '已添加 {n} 个下载；跳过 {skipped} 个；失败 {failed} 个',
    statusDownloadFail: '下载失败: ',
    statusCleared: '列表已清空',
    statusNotMoodle: '请在 Monash Moodle 页面使用此扩展',
    statusNoResources: '没有可下载的资源',
    resourceCount: '{n} 个资源',
    resourceSummary: '{n} 个文件 · 跳过 {skipped} 个',
    sizeUnknown: '大小未知',
    sizeOverLimit: '超过大小上限',
    typeExcluded: '已在设置中排除',
    folderWarnings: '有 {n} 个 Moodle 文件夹或作业未能完整展开，部分文件可能缺失或以 ZIP 降级项显示。',
    backTitle: '返回下载器',
    sizeTitle: '单文件大小上限',
    sizeDescription: '限制针对每个文件；启用大小限制时，大小未知的文件会被跳过。',
    unlimited: '无限制',
    unlimitedHint: '扫描最快，不检测文件大小',
    typesTitle: '允许下载的文件类型',
    typesDescription: '未勾选的分组仍显示在扫描结果中，但会被跳过。',
    selectAll: '全选',
    clearAll: '全部取消',
    reset: '恢复默认',
    save: '保存设置',
    saved: '设置已保存，下一次扫描生效。',
    resetDone: '已恢复默认设置。',
    group_pdf: 'PDF 文档',
    group_presentation: '演示文稿',
    group_document: '文字与普通文档',
    group_spreadsheet: '表格与数据文件',
    group_video: '视频',
    group_audio: '音频',
    group_image: '图片',
    group_archive: '压缩包',
    group_link: '链接与快捷方式',
    group_other: '其他文件',
  }
};

let currentLang = localStorage.getItem('moodle-dl-lang') || 'en';

function t(key, vars = {}) {
  let str = TRANSLATIONS[currentLang][key] ?? TRANSLATIONS.en[key] ?? key;
  Object.entries(vars).forEach(([k, v]) => { str = str.replace(`{${k}}`, v); });
  return str;
}

function applyTranslations() {
  document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.getElementById('langToggle').textContent = currentLang === 'en' ? '中文' : 'EN';
  updateViewHeader();
  document.querySelector('.size-grid').setAttribute('aria-label', t('sizeTitle'));
}

function toggleLang() {
  if (activeView === 'settings') draftExcludedFileGroups = getCurrentExcludedGroups();
  currentLang = currentLang === 'en' ? 'zh' : 'en';
  localStorage.setItem('moodle-dl-lang', currentLang);
  applyTranslations();
  if (activeView === 'settings') renderFileGroups();
  if (scannedResources?.length > 0) {
    renderResources(scannedResources);
    updateStats(scannedResources);
  }
}

let scannedResources = null;
let scannedWarnings = [];
let maxFileSizeMb = 0;
let excludedFileGroups = [];
let draftExcludedFileGroups = [];
let activeView = 'home';

const scanBtn = document.getElementById('scanBtn');
const downloadBtn = document.getElementById('downloadBtn');
const clearBtn = document.getElementById('clearBtn');
const loadingSpinner = document.getElementById('loadingSpinner');
const resultsContainer = document.getElementById('resultsContainer');
const emptyState = document.getElementById('emptyState');
const statusMessage = document.getElementById('statusMessage');
const statusSection = document.querySelector('.status-section');
const statsSection = document.getElementById('statsSection');
const weekCountEl = document.getElementById('weekCount');
const resourceCountEl = document.getElementById('resourceCount');
const skippedCountEl = document.getElementById('skippedCount');
const loadingText = document.getElementById('loadingText');
const settingsBtn = document.getElementById('settingsBtn');
const appTitle = document.getElementById('appTitle');
const homeView = document.getElementById('homeView');
const settingsView = document.getElementById('settingsView');
const fileGroupGrid = document.getElementById('fileGroupGrid');
const saveStatus = document.getElementById('saveStatus');
let statusTimer = null;

function showStatus(message, type = 'info') {
  if (statusTimer) clearTimeout(statusTimer);
  statusMessage.textContent = message;
  statusMessage.className = `status-message show ${type}`;
  statusSection.classList.add('show');
  statusTimer = setTimeout(() => {
    statusMessage.classList.remove('show');
    statusSection.classList.remove('show');
    statusTimer = null;
  }, 3000);
}

function updateStats(resources) {
  if (!resources?.length) { statsSection.style.display = 'none'; return; }
  let totalWeeks = 0, totalResources = 0, totalSkipped = 0;
  resources.forEach(course => {
    totalWeeks += course.weeks.length;
    course.weeks.forEach(week => {
      totalResources += week.resources.length;
      totalSkipped += week.resources.filter(resource => resource.downloadable === false).length;
    });
  });
  weekCountEl.textContent = totalWeeks;
  resourceCountEl.textContent = totalResources;
  skippedCountEl.textContent = totalSkipped;
  statsSection.style.display = 'flex';
}

function getResourceIcon(type) {
  return {
    PDF: '📄', PPT: '📊', DOC: '📝', XLS: '📈', VIDEO: '🎥',
    AUDIO: '🎵', IMAGE: '🖼️', ARCHIVE: '🗜️', URL: '🔗', FOLDER_ZIP: '🗜️'
  }[type] || '📎';
}

function getResourceTotals(resources) {
  let total = 0;
  let skipped = 0;
  for (const course of resources || []) {
    for (const week of course.weeks || []) {
      total += week.resources.length;
      skipped += week.resources.filter(resource => resource.downloadable === false).length;
    }
  }
  return { total, skipped, downloadable: total - skipped };
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

function getResourceMeta(resource) {
  const parts = [];
  if (resource.folderPath) parts.push(resource.folderPath);
  if (resource.sizeStatus === 'known') parts.push(formatFileSize(resource.sizeBytes));
  if (resource.skipReason === 'size-limit') parts.push(t('sizeOverLimit'));
  if (resource.skipReason === 'size-unknown') parts.push(t('sizeUnknown'));
  if (resource.skipReason === 'file-type') parts.push(t('typeExcluded'));
  return parts.filter(Boolean).join(' · ');
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
  downloadBtn.disabled = getResourceTotals(resources).downloadable === 0;

  const course0 = resources[0];
  const scanType0 = course0.scanType || 'weekpage';
  const pathInfoDiv = document.createElement('div');
  pathInfoDiv.className = 'path-info';
  pathInfoDiv.textContent = t(scanType0 === 'courseindex' ? 'pathIndex' : 'pathPage', { course: course0.name });
  resultsContainer.appendChild(pathInfoDiv);

  if (scannedWarnings.length > 0) {
    const warning = document.createElement('div');
    warning.className = 'scan-warning';
    warning.textContent = t('folderWarnings', { n: scannedWarnings.length });
    resultsContainer.appendChild(warning);
  }

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
      const weekDisplayName = week.folderName
        || ((week.weekNumber !== undefined && scanType === 'courseindex') ? `Week ${week.weekNumber}` : week.name);
      const weekSkipped = week.resources.filter(resource => resource.downloadable === false).length;

      const weekItem = document.createElement('div');
      weekItem.className = 'week-item';

      const weekHeader = document.createElement('div');
      weekHeader.className = 'week-header';
      weekHeader.innerHTML = `
        <span>${escapeHtml(weekDisplayName)}</span>
        <span style="font-size:11px;color:#888">${t('resourceSummary', { n: week.resources.length, skipped: weekSkipped })}</span>
      `;

      const weekContent = document.createElement('div');
      weekContent.className = 'week-content';

      const list = document.createElement('ul');
      list.className = 'resource-list';

      week.resources.forEach(resource => {
        const item = document.createElement('li');
        item.className = `resource-item${resource.downloadable === false ? ' skipped' : ''}`;
        const meta = getResourceMeta(resource);
        const typeClass = String(resource.type || 'file').toLowerCase();
        item.innerHTML = `
          <span class="resource-icon">${getResourceIcon(resource.type)}</span>
          <span class="resource-info">
            <span class="resource-name" title="${escapeHtml(resource.name)}">${escapeHtml(resource.name)}</span>
            ${meta ? `<span class="resource-meta" title="${escapeHtml(meta)}">${escapeHtml(meta)}</span>` : ''}
          </span>
          <span class="resource-type ${typeClass}">${escapeHtml(resource.type)}</span>
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
    loadingText.textContent = t('loading');
    emptyState.style.display = 'none';
    resultsContainer.innerHTML = '';
    scanBtn.disabled = true;

    const maxFileSizeBytes = maxFileSizeMb > 0
      ? maxFileSizeMb * 1024 * 1024
      : null;

    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, {
        action: 'scanResources',
        maxFileSizeBytes,
        excludedFileGroups
      });
    } catch {
      showStatus(t('statusInit'), 'info');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: chrome.runtime.getManifest().content_scripts.flatMap(entry => entry.js)
      });
      await new Promise(r => setTimeout(r, 500));
      response = await chrome.tabs.sendMessage(tab.id, {
        action: 'scanResources',
        maxFileSizeBytes,
        excludedFileGroups
      });
    }

    if (response?.success) {
      scannedResources = response.resources;
      scannedWarnings = response.warnings || [];
      if (scannedResources?.length > 0) {
        renderResources(scannedResources);
        updateStats(scannedResources);
        const totals = getResourceTotals(scannedResources);
        showStatus(
          scannedWarnings.length > 0
            ? t('statusFoundWarnings', { n: scannedWarnings.length })
            : t('statusFound', { n: totals.total, skipped: totals.skipped }),
          scannedWarnings.length > 0 ? 'info' : 'success'
        );
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
      ? t('statusDownloaded', {
          n: response.count || 0,
          skipped: response.skipped || 0,
          failed: response.failed || 0
        })
      : t('statusDownloadFail') + response.error,
      response.success && !response.failed ? 'success' : 'error');
  } catch (error) {
    showStatus(t('statusDownloadFail') + error.message, 'error');
  } finally {
    downloadBtn.disabled = false;
  }
}

function clearList(showMessage = true) {
  scannedResources = null;
  scannedWarnings = [];
  resultsContainer.innerHTML = '';
  emptyState.style.display = 'flex';
  statsSection.style.display = 'none';
  downloadBtn.disabled = true;
  if (showMessage) showStatus(t('statusCleared'), 'info');
}

async function loadSettings() {
  const stored = await chrome.storage.local.get({
    maxFileSizeMb: 0,
    excludedFileGroups: []
  });
  const allowedValues = [0, 10, 20, 50];
  const value = Number(stored.maxFileSizeMb);
  maxFileSizeMb = allowedValues.includes(value) ? value : 0;
  excludedFileGroups = Array.isArray(stored.excludedFileGroups)
    ? stored.excludedFileGroups.filter(id => FILE_GROUPS.some(group => group.id === id))
    : [];
  populateSettingsForm();
}

function getCurrentExcludedGroups() {
  return [...document.querySelectorAll('[data-file-group]')]
    .filter(input => !input.checked)
    .map(input => input.dataset.fileGroup);
}

function renderFileGroups() {
  fileGroupGrid.innerHTML = '';
  const excluded = new Set(draftExcludedFileGroups);

  for (const group of FILE_GROUPS) {
    const label = document.createElement('label');
    label.className = 'file-group-option';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.fileGroup = group.id;
    input.checked = !excluded.has(group.id);

    const icon = document.createElement('span');
    icon.className = 'group-icon';
    icon.textContent = group.icon;

    const copy = document.createElement('span');
    copy.className = 'group-copy';
    const title = document.createElement('strong');
    title.textContent = t(`group_${group.id}`);
    const extensions = document.createElement('small');
    extensions.textContent = group.extensions;
    copy.append(title, extensions);

    label.append(input, icon, copy);
    fileGroupGrid.appendChild(label);
  }
}

function populateSettingsForm() {
  const sizeInput = document.querySelector(`input[name="maxFileSizeMb"][value="${maxFileSizeMb}"]`);
  if (sizeInput) sizeInput.checked = true;
  draftExcludedFileGroups = [...excludedFileGroups];
  renderFileGroups();
  saveStatus.textContent = '';
}

function updateViewHeader() {
  const isSettings = activeView === 'settings';
  appTitle.textContent = t(isSettings ? 'settingsTitle' : 'title');
  settingsBtn.innerHTML = isSettings
    ? '<svg class="back-arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H6.5M11.5 6.5 6 12l5.5 5.5"/></svg>'
    : '⚙️';
  settingsBtn.classList.toggle('is-back', isSettings);
  const buttonLabel = t(isSettings ? 'backTitle' : 'settingsTitle');
  settingsBtn.title = buttonLabel;
  settingsBtn.setAttribute('aria-label', buttonLabel);
}

function setActiveView(view) {
  activeView = view;
  const isSettings = view === 'settings';
  homeView.hidden = isSettings;
  settingsView.hidden = !isSettings;
  if (isSettings) populateSettingsForm();
  updateViewHeader();
}

async function saveSettings(messageKey = 'saved') {
  const selectedSize = Number(document.querySelector('input[name="maxFileSizeMb"]:checked')?.value || 0);
  maxFileSizeMb = [0, 10, 20, 50].includes(selectedSize) ? selectedSize : 0;
  excludedFileGroups = getCurrentExcludedGroups();
  draftExcludedFileGroups = [...excludedFileGroups];
  await chrome.storage.local.set({ maxFileSizeMb, excludedFileGroups });
  saveStatus.textContent = t(messageKey);
  setTimeout(() => { saveStatus.textContent = ''; }, 3000);
}

function setAllFileGroups(checked) {
  document.querySelectorAll('[data-file-group]').forEach(input => { input.checked = checked; });
}

chrome.runtime.onMessage.addListener(message => {
  if (message.action !== 'scanProgress' || loadingSpinner.style.display === 'none') return false;
  if (message.phase === 'folders') {
    loadingText.textContent = t('loadingFolders', message);
  } else if (message.phase === 'sizes') {
    loadingText.textContent = t('loadingSizes', message);
  }
  return false;
});

scanBtn.addEventListener('click', scanResources);
downloadBtn.addEventListener('click', downloadAll);
clearBtn.addEventListener('click', clearList);
document.getElementById('langToggle').addEventListener('click', toggleLang);
settingsBtn.addEventListener('click', () => {
  setActiveView(activeView === 'home' ? 'settings' : 'home');
});
document.getElementById('selectAllBtn').addEventListener('click', () => setAllFileGroups(true));
document.getElementById('clearAllBtn').addEventListener('click', () => setAllFileGroups(false));
document.getElementById('saveBtn').addEventListener('click', () => saveSettings('saved'));
document.getElementById('resetBtn').addEventListener('click', async () => {
  document.querySelector('input[name="maxFileSizeMb"][value="0"]').checked = true;
  setAllFileGroups(true);
  await saveSettings('resetDone');
});

document.addEventListener('DOMContentLoaded', async () => {
  applyTranslations();
  scanBtn.disabled = true;
  try {
    await loadSettings();
  } finally {
    scanBtn.disabled = false;
  }
  downloadBtn.disabled = !scannedResources?.length;
  if (scannedResources?.length > 0) {
    renderResources(scannedResources);
    updateStats(scannedResources);
  }
});

applyTranslations();
