# 排错指南

先做两件事，多数问题到此为止：

1. 在 `chrome://extensions/` 点扩展卡片上的刷新按钮。
2. 刷新 Moodle 页面，确认已登录，再 Scan。

## 文件没有进子文件夹

`chrome.downloads.download()` 的 `filename` 可以带路径，Chrome 会自动创建文件夹。文件全部落在 `Downloads` 根目录时，按顺序检查：

1. Chrome 设置 → 下载内容 → **下载前询问每个文件的保存位置**必须关闭。
2. 其他管理下载的扩展可能改写文件名，先停用它们再试。
3. 在 service worker 控制台（见下文）运行下面的代码，看是否生成 `TestFolder/Sub/` 子文件夹：

```javascript
chrome.downloads.download({
  url: 'data:text/plain,test',
  filename: 'TestFolder/Sub/test.txt',
  saveAs: false
});
```

子文件夹没有出现，说明问题在 Chrome 设置或其他扩展，不在本扩展。

## 扫描结果为空或不完整

| 现象 | 处理 |
| --- | --- |
| `No resources found` | 确认当前是 unit 页面而不是 `My units`；刷新后重试 |
| 只扫到一个章节 | 地址栏带 `&section=N` 时只扫当前章节；回到 Unit dashboard 扫整个 unit |
| 少了某些章节 | 打开左侧 course index 抽屉，展开折叠的章节后重试 |
| label 正文里链接的文件没有出现 | 这些文件只在对应章节自己的页面上才能扫到，进入该章节页面再 Scan |
| 带锁的条目没有出现 | 正常，无权访问的条目不会下载 |
| quiz / forum / choice 没有出现 | 正常，这些活动没有可下载的文件 |
| 某个作业没有出现 | 该作业的说明里没有附件；有附件却没出现时，按「反馈问题」提供信息 |

## 文件名或类型不对

| 现象 | 原因 |
| --- | --- |
| 文件没有扩展名 | 扫描时 Moodle 没有返回文件信息（超时或会话过期）。重新登录后再扫 |
| 列表里类型显示 `FILE` | 同上 |
| 出现 `Name (1).pdf` | 同一文件夹里有重名文件，Chrome 自动改名 |
| 文件夹显示为一个 `.zip` | Moodle 文件夹页面无法解析，退回到整包下载 |
| 弹窗提示有文件夹或作业未能完整展开 | 对应页面请求失败，通常是会话过期或网络问题，重新扫描 |

## 查看日志

**后台（下载）**：`chrome://extensions/` → 本扩展 → 点击 **Service Worker**，打开的开发者工具里看 Console。下载失败时会有 `Failed to download [文件名]`。

**页面（扫描）**：在 Moodle 页面按 F12 → Console。扫描失败的原因也会显示在弹窗的状态栏里。

**下载记录**：`chrome://downloads/` 可以看到每个文件的实际保存路径和失败原因。

## 反馈问题

到 [Issues](https://github.com/Zetanegative1/Monash-Moodle-Downloader/issues) 提交，并附上：

1. 扩展版本号和当前页面的地址（unit dashboard 还是章节页面）。
2. 期望出现但没有出现的条目名称，或者出错的文件名。
3. Service Worker 控制台里的报错。

页面结构不同导致的问题，最有用的是把该页面保存成单个 HTML 文件。提交前用 `scripts/sanitize_fixture.js` 去掉个人信息，用法见 [README](../README.md#-development)。
