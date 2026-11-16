# 四个样本 unit：结构、现状与期望清单

样本是 2026-11-13 用 SingleFile 另存的四个 Unit dashboard 页面（`course/view.php?id=…`，不带 `section` 参数），经 `scripts/sanitize_fixture.js` 脱敏后保存为 `tests/fixtures/<unit>.html`，其中的人名已替换成 `Person N`。每个 unit 的逐项清单见同目录的 `<unit>.md`；golden test 读取的是内容相同的 `tests/fixtures/<unit>.expected.json`。

## 页面结构

四个页面都是 Monash 自定义课程格式 `format-mst`（`body#page-course-view-mst.format-mst`），骨架相同，差别在 `Learning` 下面放了什么。

| | CHE5883 | ENG5100 | ENG5105 | MTE5886 |
| --- | --- | --- | --- | --- |
| 顶层 section | 7 | 7 | 6（无 Schedule） | 7 |
| `Learning` 下的页面 | Week 1–13 | Week 1–12 + `During the break` | 4 个非周标题（`Getting started`、`Project and Team Information`、`Weekly Workshop - Common Materials`、`Chemical and Materials Engineering`） | `Additional information and resources` + Week 1–12、14、16 |
| course index section 总数 | 64 | 64 | 20 | 65 |
| 有链接的 cm | 61 | 98 | 62 | 62 |
| 无链接（隐藏）cm | 33 | 78 | 80 | 43 |
| 受限 cm | 0 | 0 | 19 | 0 |
| 主要资源形态 | folder ×40 | resource ×26、url ×21、folder ×13 | resource ×17、大量 label | resource ×42 |

共同点：

- **正文没有课程内容。** `#region-main` 只渲染 section 0：`li#section-0.course-section` 里是一个 `li.activity-mst-widgets` 小组件（当前周卡片、论坛摘要、联系人），以及 `ul#mst-navigation.first-level-nav` 顶部 tab。
- **完整结构只在 course index。** `nav#courseindex > #courseindex-content > .courseindex[role=tree]`，section 是 `div.courseindex-section[data-for=section][data-id][data-number]`，子 section 挂在 `div.courseindex-sectioncontent-children[data-for=subsectionlist]` 下，共三层：
  1. 顶层 tab：`Unit dashboard` / `Unit information` / `Schedule` / `Learning` / `Assessments` / `Forums` / `Support`
  2. 页面级 section：标题链接是独立页面 `course/view.php?id=X&section=N`（`Learning` 的子项）
  3. 页内子 section：标题链接是父页面的锚点 `course/view.php?id=X&section=N#section-M`（周下面的 `Own-time` / `Real-time` / `Wrap-up`，`Assessments` 下面的 `1. Written` 等）
- **活动条目**是 `li.courseindex-item[data-for=cm][data-id] > a.courseindex-link[data-for=cm_name]`。`li` 上没有 `modtype_*` class，类型只能从 href 的 `/mod/<type>/view.php` 读出。
- **无链接条目**是 `li.courseindex-item.d-flex-noedit`（label、`cms` 等内联内容），默认隐藏。
- **受限条目**是 `li.courseindex-item.restrictions.dimmed`，链接带 `data-anchor="true"`，href 只是课程页锚点 `course/view.php?id=X&section=N#module-<cmid>`，旁边的 `span.courseindex-locked` 可见。
- **Panopto** 没有直接的视频链接：右侧 `block_panopto` 只有 `itpc://` podcast 订阅；录播入口是 `mod/lti` 活动（`Learning Capture`、`Live-stream and lecture recordings`）。

## 清单采用的规则

2026-11-16 确认。

1. **范围**：course index 里的所有 section，不限于 `Learning`。
2. **文件夹**：每个有资源的顶层或页面级 section 一个文件夹；页内子 section 拍平进所属页面（沿用 README 里的现有约定），清单保留「子 section」列。只做容器的 section（`Learning`）不产生文件夹。顺序按 course index 的文档顺序。
3. **文件夹名**：标题以 `Week N` 开头的用 `Week N`（沿用现有约定），其余用清洗后的完整标题。
4. **类型**（由 href 判定）：

   | Moodle 类型 | 处理 |
   | --- | --- |
   | `resource` | 下载文件；保存名 = 活动名 + 服务器给出的真实扩展名 |
   | `folder` | 展开成真实文件，放进以活动名命名的子目录，保留 folder 内部目录 |
   | `url`、`page`、`lti` | `.url` 快捷方式，归入 link 分组 |
   | 正文里的 `pluginfile.php` 链接 | 下载文件，保存名取 URL 中的文件名，归到该 cm 所属 section |
   | `assign`、`quiz`、`forum`、`choice` 及其他 | 不下载 |
   | 受限、无链接 | 不下载 |

5. **保存名**：非法字符 `<>:"/\|?*` 换成 `-`，合并空白，去掉结尾的 `-`、`.`、空格，截断到 120 字符。
6. `dimmed` 但仍有活动链接的条目照常处理。

## 现有代码的问题

验证方式：用 jsdom 加载存档，mock 掉 `fetch` 和 `chrome.downloads`，直接跑 4.6.1 的 `scanPageResources()` 和 `handleDownloadAll()`；原始存档和脱敏后的 fixture 结果一致。

| | CHE5883 | ENG5100 | ENG5105 | MTE5886 |
| --- | --- | --- | --- | --- |
| 期望项数 | 56 | 63 | 26 | 52 |
| 现有输出项数 | 38 | 58 | 23 | 52 |
| 漏掉 | 19 | 5 | 7 | 7 |
| 误收（不该下载） | 1 | 0 | 4 | 7 |
| 会存成 `.php` 的 resource | 0 | 24 | 16 | 39 |
| 类型错 | 0 | 0 | 1 | 1 |
| 命名不同 | 0 | 14 | 0 | 0 |

1. **只扫 `Learning` 子树。** `findWeekContainer()`（`content.js:551`）按标题文本 `/^\s*Learning\s*$/` 找容器，`Unit information`、`Assessments`、`Forums`、`Support` 全部被跳过。CHE5883 的 `Assessments / 1. Written` 有 2 个 folder 和 10 个 resource，一个都没扫到。
2. **`mod/resource` 的下载文件名以 `.php` 结尾。** course index 里只有 `mod/resource/view.php?id=…`，`collectActivityDescriptors()` 找的直链 `a[href*="/mod_resource/content/"]`（`content.js:121`）在这里不存在；活动名没有扩展名，`downloadFile()`（`background.js:72`）就从 URL 路径取到 `php`。MTE5886 传给 `chrome.downloads.download` 的 52 个文件名里 46 个是 `.php`，例如 `Week 7/Week 7 - Lecture slides.php`。Chrome 实际落盘时是否改名离线无法确认。
3. **非文件活动被当成文件。** `extractRegularResource()`（`content.js:206`）只特判了 lti 和 url，`forum` / `assign` / `quiz` / `choice` 落到 `classifyResource()` 变成 `FILE`，下载的是活动页面的 HTML，例如 MTE5886 的 `Week 14/Mock exam questions.php`、`Week 16/General Discussion Forum.php`。
4. **受限条目被当成文件，并被去重吞掉。** ENG5105 section 20 的 5 个 `Aspen Assessment Week N [2%]` 链接都是 `…&section=20#module-<id>`，`normalizeUrlForDedupe()`（`content.js:719`）去掉 hash 后合并成 1 项，下载的是课程页本身。
5. **`section=0` 的 dashboard 扫不到任何东西。** 顶部 `UNIT DASHBOARD` tab 的链接是 `course/view.php?id=X&section=0`；`isWeekPage = /[?&]section=\d+/`（`content.js:41`）把它判成周页面，`getPageWeekDefinitions()` 在只有小组件的正文里找不到资源，返回空。用 MTE5886 存档加这个 URL 复现：`No resources found`。
6. **类型错。** 所有 `mod/lti` 归为 `VIDEO`（`content.js:218`），`Leganto Reading List`、`Studiosity`、`EdStem Forums` 都不是视频；`mod/page`（ENG5105 的 `Teamwork Video 2025`）归为 `FILE`，下载到的是 HTML。
7. **保存名结尾多出 `-`。** ENG5100 的活动名常以 `*` 或 `?` 结尾，清洗后变成 `Week 1 lecture pdf-`、`What are Australian values-.url`，共 14 项。
8. **非周 section 被排到最后。** `processWeekDefinitions()` 按 `weekNumber` 排序（`content.js:171`），MTE5886 的 `Additional information and resources`（Moodle 里排第一）和 ENG5100 的 `During the break`（Week 8 与 9 之间）都落到末尾。`extractWeekNumber()`（`content.js:622`）的正则没有锚定开头，标题里任何位置出现 `week 3` 都会被命名成 `Week 3`；样本里没有命中。
9. **正文内嵌文件链接漏掉。** ENG5105 dashboard 上 `li#module-5614139.modtype_cms .activity-altcontent` 里有 Unit Guide 的 `pluginfile.php/…/Unit Guide_Rev0.pdf`，现有选择器不覆盖。

## 样本覆盖不到的部分

- **周页面模式**（`…&section=N`）：没有 section 页面的存档，`getPageWeekDefinitions()` 在 `format-mst` 正文上的表现无法离线判断。
- **label / `cms` 的内嵌链接**：这些条目在 course index 里是隐藏的无链接项，SingleFile 存档时清空了内容（四个 unit 共 234 项，各 unit 清单末尾按 section 列出了 cm id）。只有 ENG5105 dashboard 上恰好渲染了一个。
- **folder 的内容、resource 的真实扩展名和大小**：需要请求 Moodle，测试里用 mock。
- **SingleFile 的副作用**：带 `sf-hidden` 的节点内容被清空（如 `#mst-navigation .second-level-nav`、隐藏的 cm `li`），存档与线上 DOM 在这些节点上不一致。
