# 上传到 GitHub

你已经装好 Git，直接走下面几步就行。用 **Git Bash**（在项目文件夹右键 → "Open Git Bash here"）最顺手。

---

## 第一步：GitHub 上新建仓库

1. 登录 GitHub → 右上角 **+** → **New repository**
2. 填写：
   - **Repository name**：`monash-moodle-downloader`
   - **Description**：`Chrome extension to batch-download Monash Moodle resources`
   - **Public** ✓（方便同学用）
   - ⚠️ **不要**勾选任何初始化选项（README / .gitignore / license 全不选）
3. 点 **Create repository**，复制页面上出现的仓库地址，例如：
   ```
   https://github.com/Zetanegative1/Monash-Moodle-Downloader.git
   ```

---

## 第二步：本地初始化并推送

在 Git Bash 里依次运行（把 URL 替换成你的）：

```bash
git init
git branch -M main
git add .
git status         # 确认 CLAUDE.md / .claude/ 不在列表里
git commit -m "Initial release: v4.4.0"
git remote add origin https://github.com/Zetanegative1/Monash-Moodle-Downloader.git
git push -u origin main
```

第一次 `git push` 会弹出登录窗口，用 **Personal Access Token (PAT)** 代替密码：
- GitHub → Settings → Developer settings → Personal access tokens → **Generate new token (classic)**
- 勾选 `repo`，生成后复制
- 弹窗里用户名填 GitHub 用户名，密码填 token（粘贴即可）

---

## 第三步：后续更新（日常三步走）

```bash
git add .
git commit -m "简单说明改了什么"
git push
```

---

## 打 Release（可选）

```bash
git tag -a v4.4.0 -m "v4.4.0"
git push origin v4.4.0
```

然后 GitHub 网页：**Releases → Draft a new release** → 选 tag → 写说明 → Publish。

---

## 常见问题

**Q：`git push` 提示 "Updates were rejected"**
```bash
git pull origin main --allow-unrelated-histories
git push
```

**Q：想把某个文件从已提交历史里移除**
```bash
git rm --cached 文件名
echo "文件名" >> .gitignore
git commit -m "remove unwanted file"
git push
```
