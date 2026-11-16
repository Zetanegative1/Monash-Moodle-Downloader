# 安装指南

## 方式一：下载 ZIP（推荐）

1. 打开 [最新 Release](https://github.com/Zetanegative1/Monash-Moodle-Downloader/releases/latest)。
2. 在 **Assets** 里下载 `Monash-Moodle-Downloader-vX.Y.Z.zip`，解压到一个不会被移动或删除的文件夹。
3. 在 Chrome 地址栏打开 `chrome://extensions/`，打开右上角的**开发者模式**。
4. 点击**加载已解压的扩展程序**，选择解压后包含 `manifest.json` 的文件夹。
5. 把扩展图标固定到工具栏。

Chrome 不会自动更新已解压的扩展。有新版本时，下载并解压新的 ZIP，再加载一次。

## 方式二：克隆仓库

```bash
git clone https://github.com/Zetanegative1/Monash-Moodle-Downloader.git
```

然后按方式一的第 3–5 步加载仓库文件夹。扩展没有构建步骤，源码即可直接加载。

## 安装后需要做的一项设置

打开 Chrome 设置 → 下载内容，关闭**下载前询问每个文件的保存位置**。这一项开着时 Chrome 会忽略扩展指定的子文件夹。

## 使用

1. 登录 [Monash Moodle](https://learning.monash.edu/my/)，进入一个 unit。
2. 点击工具栏里的扩展图标 → **Scan** → **Download All**。

| 你所在的页面 | 下载范围 | 保存位置 |
| --- | --- | --- |
| Unit dashboard | 整个 unit 的所有章节 | `Downloads/<课程全名>/<章节>/…` |
| 某个章节页面（地址带 `&section=N`） | 只有这个章节 | `Downloads/<章节>/…` |

- 标题以 `Week N` 开头的章节保存为 `Week N`，其余章节用原标题。
- Moodle 文件夹和带附件的作业各自展开成一个子文件夹，例如 `Assessments/Team project report/…`。
- quiz、forum、choice、没有附件的作业和你无权访问的条目不会下载。
- 点 ⚙️ 可以设置单个文件的大小上限和要下载的文件类型，下次扫描生效。

## 更新扩展后

在 `chrome://extensions/` 点扩展卡片上的刷新按钮，然后刷新已经打开的 Moodle 页面。

## 扩展包里的文件

| 文件 | 作用 |
| --- | --- |
| `manifest.json` | 扩展配置 |
| `content.js` | 内容脚本入口，响应扫描请求 |
| `lib/moodle-page.js` | 读取页面结构（course index 和正文） |
| `lib/download-plan.js` | 决定哪些章节成为文件夹、每类活动如何处理 |
| `lib/resource-resolver.js` | 展开文件夹和作业，获取真实文件名、类型和大小 |
| `lib/shared.js` | 命名和文件类型规则，内容脚本和后台共用 |
| `background.js` | 后台 service worker，发起下载 |
| `popup.html` / `popup.css` / `popup.js` | 弹窗界面和设置 |
| `icons/` | 扩展图标 |

遇到问题见 [DEBUG.md](./DEBUG.md)。
