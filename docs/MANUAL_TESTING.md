# 4.7.0 手动验证清单

自动化测试用的是四个脱敏后的 dashboard 存档和一个模拟的 Moodle 服务器。下面这些只能在登录后的真实 Moodle 上确认。

准备：`chrome://extensions/` → 重新加载扩展 → 刷新 Moodle 标签页。Chrome 设置里关闭「下载前询问每个文件的保存位置」。

## 1. 扩展能正常加载

1. 在 `chrome://extensions/` 点扩展卡片上的 **Service Worker**，确认 Console 没有 `importScripts` 相关报错。
2. 打开任意 unit 页面，F12 → Console，确认没有来自 `lib/*.js` 或 `content.js` 的报错。
3. 不刷新一个早已打开的 Moodle 标签页，重新加载扩展后直接点 **Scan**。预期：提示初始化后扫描成功（弹窗会重新注入五个内容脚本）。

## 2. resource 文件的名称和扩展名

离线无法确认 `mod/resource/view.php` 对 `HEAD` 请求的实际响应。

1. 打开 MTE5886 dashboard，Scan。
2. 展开 `Week 7`：`Week 7 - Lecture slides` 应显示具体类型（PDF / PPT 等）和大小，而不是 `FILE`。
3. Download All，确认落盘为 `…/Week 7/Week 7 - Lecture slides.<真实扩展名>`，能正常打开，目录里没有 `.php` 文件。
4. 如果仍有文件没有扩展名：在 Moodle 里点开那个活动，看它是直接下载还是先显示一个页面，把该页面另存下来发给我。

## 3. 扫描是否把 resource 标记为「已查看」

扫描会对每个 resource 发一次请求，并打开每个作业页面，Moodle 可能把它们记为一次查看。

1. 找一个完成条件是「查看」且状态为 To do 的 resource。
2. 只 Scan，不下载。
3. 刷新页面，看它是否变成 Done。如果介意这一点，告诉我，可以改成只在下载时解析扩展名。

## 4. course index 是否完整

1. 关闭左侧 course index 抽屉，刷新页面，Scan，记下文件夹数和资源数。
2. 打开抽屉再 Scan，数量应一致。
3. 把 `Learning` 折叠起来再 Scan，数量应一致。

期望的文件夹数和项数见 `docs/fixtures-expected/<unit>.md` 的开头。

## 5. `UNIT DASHBOARD` 标签页

点顶部的 `UNIT DASHBOARD`（地址变成 `…&section=0`）后 Scan。预期与第 4 步结果相同，4.6.1 在这里扫不到任何东西。

## 6. section 页面模式

1. 打开 MTE5886 的 Week 7 页面（地址带 `&section=N`），Scan。预期：只有 `Week 7` 一个文件夹，下载到 `Downloads/Week 7/`。
2. 打开 ENG5105 的 `Weekly Workshop - Common Materials` 页面，Scan。预期：除了 7 个活动，还能看到 label 正文里链接的文件。
3. 打开 ENG5100 的 `Assessments` 页面，Scan。预期：`Team project report` 下有两个附件，下载后在 `Downloads/Assessments/Team project report/` 里；没有附件的作业、quiz、choice 不出现；列表里没有你自己提交的文件。

任何一步结果不对，用 SingleFile 另存该页面，可以直接加成新的 fixture。

## 7. 受限条目与非文件活动

1. ENG5105 dashboard Scan：`Chemical and Materials Engineering` 里不应出现带锁的 `Aspen Assessment Week N [2%]`。
2. MTE5886 dashboard Scan：不应出现 `Mock exam questions`（quiz）和 `General Discussion Forum`。`Assignment 1` 等作业只有带附件时才出现，且是附件本身，不是 `.php` 页面。

## 8. 文件夹展开与快捷方式

1. CHE5883 dashboard Scan：`Week 1` 下的 `Lecture notes` 应展开成真实文件；下载后在 `Week 1/Lecture notes/` 里。
2. `Unit information/Leganto Reading List.url` 双击应打开对应的 Moodle 活动。
3. CHE5883 的 `Unit information` 里有 `Learning Capture` 和 `Learning capture` 两项，Windows 上第二个应被 Chrome 自动改名为 `… (1).url`。

## 9. 大小限制与类型过滤

1. 设置 10 MB 上限后 Scan：超限文件显示为跳过，快捷方式不受影响。
2. 取消勾选 PDF 后 Scan：resource 里的 PDF 和 folder 里的 PDF 都显示为跳过。

## 10. 路径长度

ENG5100 的课程名和活动名都很长。Download All 后检查 `Week 2`、`Week 3` 下的文件是否都落盘，Chrome 下载列表里有没有失败项。
