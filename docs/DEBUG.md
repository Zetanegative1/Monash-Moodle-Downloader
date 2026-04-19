# 下载文件夹问题调试指南

## ✅ Chrome 插件完全支持创建子文件夹！

Chrome 的 `chrome.downloads.download()` API 的 `filename` 参数可以包含路径：
```javascript
filename: 'ENG5001/Week 1/file.pdf'
```
这会自动创建 `ENG5001/` 和 `Week 1/` 文件夹。

---

## 🔍 如何查看下载日志

### 1. 打开 Background Service Worker 控制台

1. 访问 `chrome://extensions/`
2. 找到 "Monash Moodle Downloader"
3. 点击 "Service Worker" 蓝色链接
4. 会打开一个开发者工具窗口

### 2. 在 Service Worker 控制台中查看日志

点击"一键下载全部"后，您应该看到：

```
[Background] 扫描类型: courseindex
[Background] Unit首页 - Week编号: 1 文件夹: Week 1
[Background] 周 Week 1 包含 5 个资源
[Background] 下载文件:
  - URL: https://learning.monash.edu/mod/resource/...
  - 文件名: Reading_Notes.pdf
  - 完整路径: ENG5001/Week 1/Reading_Notes.pdf
  - 相对路径: ENG5001/Week 1
[Background] 下载任务已添加，ID: 1234
[Background] 总共添加了 15 个下载任务
```

### 3. 验证下载路径

检查下载管理页面：
1. 访问 `chrome://downloads/`
2. 查看文件的"完整路径"列
3. 应该显示：`Downloads/ENG5001/Week 1/Reading_Notes.pdf`

---

## 🧪 测试步骤

### 重新加载扩展
```
chrome://extensions/ → 点击刷新 🔄
```

### 刷新 Moodle 页面
```
在 Moodle 页面按 F5
```

### 测试 Unit 首页下载

1. 访问课程首页
2. 点击扩展 → "扫描资源"
3. 查看扫描结果（应该显示 Week 1, Week 2 等）
4. 点击"一键下载全部"
5. **立即打开 Service Worker 控制台**查看日志
6. 查看下载文件夹：应该看到 `Downloads/ENG5001/Week 1/`, `Week 2/` 等文件夹

---

## 🐛 如果仍然没有创建文件夹

### 可能原因 1：路径构建问题

**症状**：日志显示 `完整路径` 正确，但文件仍在 Downloads 根目录

**检查**：在 Service Worker 控制台运行：
```javascript
// 测试下载路径
chrome.downloads.download({
  url: 'https://example.com/test.txt',
  filename: 'TestFolder/Week1/test.txt',
  saveAs: false
}, (id) => console.log('测试下载ID:', id));
```
然后检查下载文件夹是否有 `TestFolder/Week1/` 子文件夹。

### 可能原因 2：`weekNumber` 未定义

**症状**：日志显示 `Week页面 - 文件夹: xxx` 而不是 `Unit首页 - Week编号`

**原因**：`week.weekNumber` 为 `undefined`

**检查**：在页面控制台运行：
```javascript
// 测试扫描结果
chrome.runtime.sendMessage({ action: 'scanResources' }, (response) => {
  if (response && response.success) {
    const week = response.resources[0]?.weeks[0];
    console.log('Week对象:', week);
    console.log('weekNumber:', week.weekNumber);
    console.log('scanType:', response.resources[0].scanType);
  }
});
```

### 可能原因 3：Chrome 下载位置设置

**症状**：文件保存在完全不同的位置

**解决方案**：
1. 打开 Chrome 设置
2. 搜索"下载"
3. 查看"位置"设置
4. 确保"下载前询问每个文件的保存位置"是**关闭**的

---

## 📊 预期结果对比

### ✅ 正确的下载日志

```
[Background] 扫描类型: courseindex
[Background] Unit首页 - Week编号: 2 文件夹: Week 2
[Background] 周 Week 2 包含 3 个资源
[Background] 下载文件:
  - 完整路径: ENG5001/Week 2/Python_101.pdf
  - 相对路径: ENG5001/Week 2
[Background] 下载任务已添加，ID: 1234
```

**预期文件结构**：
```
Downloads/
└── ENG5001/
    ├── Week 1/
    │   ├── file1.pdf
    │   └── file2.pptx
    └── Week 2/
        ├── Python_101.pdf
        └── file4.docx
```

### ❌ 错误情况

```
[Background] Week页面 - 文件夹: Week_2_-_Intro
[Background] 周 Week_2_-_Intro 包含 3 个资源
```

**问题**：使用的是 Week 页面扫描，不是 Unit 首页扫描

**结果**：文件保存到 `Downloads/ENG5001/Week_2_-_Intro/`

---

## 💡 关键代码逻辑

```javascript
// background.js
if (scanType === 'courseindex' && week.weekNumber !== undefined) {
  // Unit首页：使用 "Week n" 格式
  folderName = `Week ${week.weekNumber}`;  // 产生 "Week 1", "Week 2" 等
} else {
  // Week页面：使用周次原始名称
  folderName = week.name;  // 产生 "Week_2_-_Introduction_to_Python" 等
}

// 最终路径
const fullPath = `${courseName}/${folderName}/${filename}`;
// 结果：ENG5001/Week 1/Reading_Notes.pdf
```

---

## 🔧 如果问题仍然存在

请提供以下信息：

1. **Service Worker 控制台日志**（完整截图或复制文本）
2. **下载文件的完整路径**（从 chrome://downloads/ 查看）
3. **扫描类型**（是 Unit 首页还是 Week 页面）
4. **文件实际保存位置**（在文件管理器中的完整路径）

这些信息将帮助我准确定位问题！
