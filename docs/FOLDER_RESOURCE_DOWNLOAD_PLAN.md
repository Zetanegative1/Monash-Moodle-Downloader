# Moodle 文件夹资源批量下载方案

> 状态：已完成本地实现与自动化测试，等待 Chrome 手工验证  
> 调研日期：2026-08-10

> 后续扩展：大小上限已迁移到独立设置页，并与文件类型过滤整合。文件类型按 PDF、演示文稿、文字文档、表格与数据、视频、音频、图片、压缩包、链接快捷方式和其他文件分组；取消勾选的分组会在扫描结果中显示但跳过下载。

## 1. 目标

让扩展在 Unit Dashboard 或单个 Week 页面扫描时，不只把 `Lecture notes`、`After class reading` 等 Moodle 文件夹活动识别为一个链接，而是继续读取文件夹内的真实文件，并按课程、周次和文件夹名称批量下载。

本方案保持现有下载规则：

- Unit Dashboard：`Downloads/<Course>/Week N/<Folder>/<File>`
- Week 页面：`Downloads/Week N/<Folder>/<File>`
- 普通资源、外部 URL、Panopto 等现有行为不变

## 2. 浏览器实测结论

使用当前已登录的 Chrome 和实际 Monash Moodle Unit 页面进行了只读检查：

1. 当前 Unit 的侧栏课程索引中共发现 38 个 Moodle 文件夹活动。
2. 文件夹活动 URL 采用以下形式：

   ```text
   https://learning.monash.edu/mod/folder/view.php?id=<activityId>
   ```

3. 抽样访问了三个不同周次的文件夹，均能复用当前登录状态，页面未跳转到登录页。
4. 每个文件夹页面的主体中直接包含真实文件链接：

   ```text
   https://learning.monash.edu/pluginfile.php/<contextId>/mod_folder/content/0/<path>/<filename>?forcedownload=1
   ```

5. 三个样本分别解析到 3、6、5 个真实文件，页面结构和链接选择器一致。
6. 每个样本还都提供 Moodle 原生的 “Download folder” 表单：

   ```text
   GET https://learning.monash.edu/mod/folder/download_folder.php?id=<activityId>
   ```

因此存在两条可行下载路径：逐文件解析下载，以及调用 Moodle 原生 ZIP 下载。

## 3. 当前实现为什么遗漏文件夹内容

当前 `content.js` 的 `scanFromCourseIndex()` 已经能遍历周次及其子分组，并能看见 `mod/folder/view.php` 链接；但 `extractResourceFromLink()` 会把这个文件夹活动当成普通 `FILE`，返回的仍是文件夹页面 URL。

`findRealResourceLink()` 只处理 `mod/resource`，不会进入 `mod/folder` 页面。因此 `background.js` 收到的是文件夹活动本身，而不是里面的 `pluginfile.php` 文件链接。

此外，当前扫描流程是同步函数。要读取多个文件夹页面，需要把扫描链路改为异步。

## 4. 可行路径比较

| 路径 | 做法 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- | --- |
| A. 解析文件夹 HTML | 内容脚本对每个 `mod/folder/view.php` 发起同源请求，解析真实文件链接 | 保留单个文件、扩展名和目录层级；可沿用现有下载 API | 需要异步扫描、并发控制和错误处理 | **首选** |
| B. Moodle 原生 ZIP | 下载 `download_folder.php?id=...` | 实现简单、请求少、对页面 DOM 变化更耐受 | 用户得到 ZIP；扩展无法自动解压和整理单个文件 | **降级方案** |
| C. 为每个文件夹打开标签页 | 逐页导航后扫描 DOM | 容易验证 | 会打开大量标签页，速度慢且干扰用户 | 不采用 |
| D. Moodle Web Service/API | 调用课程内容接口 | 理论上数据结构更标准 | 通常需要额外 token 或未开放权限，兼容性不确定 | 不采用 |

## 5. 推荐实现方案

采用“逐文件展开，ZIP 降级”的方案。

### 5.1 扫描流程

1. 沿用现有逻辑，从课程侧栏或 Week 页面获得资源活动链接及其所属周次。
2. 普通资源继续走当前解析逻辑。
3. 遇到 `/mod/folder/view.php`：
   - 在内容脚本中使用 `fetch(folderUrl, { credentials: 'same-origin' })`；
   - 检查 HTTP 状态及最终 URL，防止登录失效时误解析登录页；
   - 使用 `DOMParser` 解析 HTML；
   - 提取 `a[href*="/pluginfile.php/"][href*="/mod_folder/content/"]`；
   - 为每个真实文件建立独立资源对象。
4. 对所有解析成功的真实文件去重，并返回 popup 展示。
5. 如果某个文件夹解析失败，但页面提供或可推导原生 ZIP URL，则将该文件夹降级为一个 ZIP 下载项，并在扫描结果中显示警告。

### 5.2 并发与性能

该实际 Unit 有 38 个文件夹，不能一次性无上限并发请求。建议：

- 同时请求 4 个文件夹；
- 单文件夹超时 15 秒；
- 使用 `Promise.allSettled()` 或等价的任务池，单个文件夹失败不终止整个 Unit；
- 扫描期间在 popup 显示“正在展开 Moodle 文件夹（x/y）”；
- 不缓存跨登录会话的真实下载 URL，避免链接或权限状态过期。

文件大小限制采用按需探测：

- 用户选择“无限制”时不发送大小探测请求，因此不会增加扫描耗时；
- 用户选择 10 MB、20 MB 或 50 MB 时，才对真实文件 URL 发送 `HEAD` 请求；
- `HEAD` 请求只读取响应头，不传输文件正文，并发数建议为 8；
- 文件夹解析与大小探测采用流水线处理：一个文件夹解析完成后立即探测其中的文件，不等待全部文件夹完成；
- 同一扫描中的重复 URL 复用已取得的大小；
- 单个大小探测建议超时 5 秒；若 `HEAD` 没有返回大小，可使用 `Range: bytes=0-0` 读取 `Content-Range` 作为一次轻量降级探测。

实际增加时间取决于文件数量和 Moodle 响应延迟。以 100～200 个文件、8 个并发请求估算，正常网络通常增加约 2～8 秒；遇到校园 SSO、代理较慢或大量超时请求时可能更长。请求不下载文件正文，因此额外流量很小。

### 5.3 资源数据结构

在现有资源对象上增加文件夹来源和相对目录：

```javascript
{
  name: "slides.pdf",
  type: "PDF",
  url: "https://learning.monash.edu/pluginfile.php/.../slides.pdf?forcedownload=1",
  originalUrl: "https://learning.monash.edu/mod/folder/view.php?id=...",
  folderPath: "Lecture notes",
  sourceType: "moodle-folder-file",
  sizeBytes: 8388608,
  sizeStatus: "known"
}
```

若 Moodle 文件夹内部还有子目录，可从 `/mod_folder/content/0/` 后的 URL 路径恢复层级，并对每个路径段分别执行文件名清理。例如：

```text
Lecture notes/Topic A/slides.pdf
```

### 5.4 下载路径

`background.js` 在现有周次路径后追加可选的 `resource.folderPath`：

```text
Unit Dashboard:
<Course>/Week 1/Lecture notes/slides.pdf

Week page:
Week 1/Lecture notes/slides.pdf
```

这样可以避免 `Lecture notes` 与 `After class reading` 中出现同名文件时发生不必要的重命名，也保留 Moodle 原有分类。

### 5.5 ZIP 降级资源

解析失败时可生成：

```javascript
{
  name: "Lecture notes.zip",
  type: "FOLDER_ZIP",
  url: "https://learning.monash.edu/mod/folder/download_folder.php?id=...",
  folderPath: "",
  sourceType: "moodle-folder-zip"
}
```

ZIP 路径由 `chrome.downloads.download()` 指定，仍放在对应 Week 目录下。实现阶段需要用一个实际文件夹验证 Chrome 下载 API 会携带 Moodle 登录态；若失败，则只报告该文件夹扫描失败，不生成无效 ZIP。

### 5.6 文件大小限制

用户可选择单个文件的最大允许大小：

- 10 MB
- 20 MB
- 50 MB
- 无限制

默认值建议为“无限制”，以保持升级前的下载行为。限制按单个文件计算，而不是整批文件的总大小。

启用限制时：

1. 扫描得到真实文件 URL 后发送 `HEAD` 请求；
2. 从 `Content-Length` 读取字节数；
3. 大于用户上限的文件保留在扫描列表中，但标记为“超过大小限制”，不加入下载任务；
4. 如果无法可靠确定大小，则标记为“大小未知”并跳过，以保证不会误下载超限的大文件；
5. URL 快捷方式不受限制，因为扩展下载的只是很小的 `.url` 文件；
6. 大小限制开启且 ZIP 总大小未知时，不使用 ZIP 降级下载。

设置保存在 `chrome.storage` 中，popup 重新打开或浏览器重启后仍然有效。

## 6. 预计代码改动

### `content.js`

- 将消息处理和 `scanPageResources()` 改为异步。
- 将课程索引扫描和 Week 页面扫描统一接入文件夹展开函数。
- 新增：
  - `isMoodleFolderUrl()`
  - `expandMoodleFolder()`
  - `parseMoodleFolderHtml()`
  - `deriveFolderRelativePath()`
  - `probeFileSize()`
  - 有并发上限的任务池
- 返回部分成功结果与文件夹级警告。

### `background.js`

- 支持 `resource.folderPath`。
- 支持可选的 `FOLDER_ZIP` 类型。
- 下载计数以实际创建的下载任务为准。
- 保持 `conflictAction: 'uniquify'`。

### `popup.js`

- 在列表中显示文件夹相对路径，例如 `Lecture notes / slides.pdf`。
- 提供 10 MB、20 MB、50 MB、无限制四档大小设置，默认无限制。
- 显示已知文件大小，以及“超过限制”或“大小未知”状态。
- 显示文件夹展开进度和部分失败警告。
- 保持现有中英文界面；新增文本需同时提供两种翻译。

### `manifest.json`

现有 `https://learning.monash.edu/*` host permission 已覆盖文件夹页和 `pluginfile.php`，预计不需要新增权限。

## 7. 错误与边界情况

- 登录过期或请求被重定向到登录页：该文件夹标记失败，不解析页面中的无关链接。
- 文件夹为空：显示为空文件夹，不创建下载任务。
- 文件夹未发布或无权限：记录警告，继续扫描其他文件夹。
- Moodle 修改 DOM：逐文件解析失败时尝试 ZIP 降级。
- 文件夹内嵌套子目录：从真实文件 URL 恢复相对路径。
- 文件名含 Windows 非法字符：对每个目录段和文件名分别清理。
- 同一真实文件重复出现：按规范化后的下载 URL 去重。
- 文件响应没有 `Content-Length`：尝试一次单字节 Range 请求；仍未知时，在限制开启状态下跳过。
- 原生 ZIP 无法可靠取得总大小：限制开启时禁用 ZIP 降级。
- 直接资源、URL、视频：继续使用现有逻辑，避免功能回归。

## 8. 验收标准

1. 在该实际 Unit Dashboard 扫描时，能发现文件夹内的真实文件，而不只显示 38 个文件夹活动。
2. 文件下载至 `<Course>/Week N/<Folder>/...`。
3. 在单个 Week 页面扫描时，同样能展开该周的文件夹。
4. 普通 PDF、PPT、DOC、外部 URL 和视频行为不回归。
5. 一个文件夹失败不会阻断其他周次和文件夹。
6. 扫描不会打开额外 Moodle 标签页。
7. 不读取或保存浏览器 Cookie；仅使用当前页面的同源登录会话。
8. 实现完成后使用当前 Chrome 中的真实 Unit 做一次小范围下载验证，再进行全课程测试。
9. 大小限制提供 10 MB、20 MB、50 MB、无限制四档；超过上限的文件不会创建下载任务。
10. 选择“无限制”时不发送文件大小探测请求。

## 9. 待人工确认的默认决策

建议确认以下默认行为后再开始编码：

1. 默认展开并下载单个文件，而不是每个 Moodle 文件夹只下载一个 ZIP。
2. 下载目录保留 Moodle 文件夹活动名称。
3. 文件夹请求并发数为 4，单请求超时 15 秒。
4. 个别文件夹解析失败时尝试 ZIP 降级，并在 popup 显示警告。
5. 本次不引入新的 Chrome 权限。

已确认的大小限制决策：

- 档位为 10 MB、20 MB、50 MB、无限制；
- 默认建议为无限制，以保持向后兼容；
- 限制应用于单个实际文件，不应用于 `.url` 快捷方式。
