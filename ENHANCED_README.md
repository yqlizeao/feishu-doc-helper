# 飞书文档助手 - 增强版

这是 [sancijun/feishu-doc-helper](https://github.com/sancijun/feishu-doc-helper) 的增强版本，新增了 DOM 解析 Fallback 功能和多项改进。

## ✨ 新增功能

### 🎯 核心改进

1. **完整的层级导出** ✅
   - 修复了子文件夹导出不全的问题
   - 现在可以正确递归导出所有嵌套层级

2. **智能 Markdown Fallback** ✅ 🆕
   - 当遇到导出权限错误时，自动从网页 DOM 提取内容
   - 转换为 Markdown 格式，无需导出权限
   - 支持标题、列表、表格、代码块等丰富元素

3. **独立 Markdown 导出按钮** ✅ 🆕
   - 工具栏新增按钮，一键导出当前页面为 Markdown
   - 无需任何权限，即时导出

4. **详细的导出统计** ✅
   - 显示成功/失败数量
   - 列出失败原因
   - 区分权限错误和其他错误

## 📦 安装

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/yqlizeao/feishu-doc-helper.git
cd feishu-doc-helper

# 安装依赖
npm install

# 构建 Chrome 扩展
npm run build:chrome

# 构建后的文件在 build/chrome-mv3-feishu-doc-helper/ 目录
```

### 加载到浏览器

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `build/chrome-mv3-feishu-doc-helper` 目录

## 🚀 使用方法

### 方式 1：批量导出（智能混合模式）

1. 访问飞书云文档或知识库页面
2. 点击工具栏的 **📤 批量导出** 按钮
3. 点击刷新按钮 🔄 重新加载文件列表（首次使用或数据变化后）
4. 选择要导出的文件夹和文件
5. 点击"确认"开始导出

**导出结果**：
- 有权限的文档 → 原格式（.docx, .xlsx）
- 无权限的文档 → 自动 Fallback 为 Markdown（.md）
- 所有文件打包在一个 zip 文件中

### 方式 2：单页 Markdown 导出

1. 打开任意飞书文档页面
2. 点击工具栏的 **📄 导出当前页为Markdown** 按钮
3. 自动提取页面内容并下载为 .md 文件

**优势**：
- ✅ 无需任何导出权限
- ✅ 即时导出，无需等待
- ✅ 适合快速导出单个文档

## 📊 功能对比

| 功能 | 原版插件 | 增强版 |
|------|---------|--------|
| 批量导出 | ✅ | ✅ |
| 层级导出完整性 | ⚠️ 不完整 | ✅ 完整 |
| 权限错误处理 | ❌ 失败 | ✅ 自动 Fallback |
| Markdown 导出 | ❌ | ✅ 支持 |
| 无权限导出 | ❌ | ✅ 支持 |
| 导出统计详情 | ⚠️ 简单 | ✅ 详细 |

## 🔧 技术细节

### 主要修改

1. **`src/contents/content-export.tsx`**
   - 添加递归收集函数 `collectAllTokens` 和 `collectExportTokens`
   - 实现权限错误 fallback 逻辑
   - 新增独立 Markdown 导出功能
   - 增强错误统计和用户反馈

2. **`src/services/export-service.ts`**
   - 修复 `getFileList` 中文件夹添加顺序
   - 确保树形结构正确构建

3. **`src/api/feishu-api.ts`**
   - 增强 `createExportTask` 的错误检查
   - 识别权限相关错误码

4. **`src/services/markdown-fallback.ts`** 🆕
   - 实现 DOM 解析核心逻辑
   - 支持多种飞书文档元素转 Markdown
   - 处理标题、列表、表格、代码块等

### DOM 解析支持的元素

- ✅ 标题（H1-H6）
- ✅ 段落和文本格式（粗体、斜体、删除线）
- ✅ 有序列表和无序列表
- ✅ 嵌套列表
- ✅ 引用块
- ✅ 代码块
- ✅ 行内代码
- ✅ 表格
- ✅ 图片（带 URL）
- ✅ 链接
- ✅ 水平分隔线

## ⚠️ 限制说明

### DOM 解析 Fallback 的限制

1. **图片链接时效性**
   - 飞书的图片链接可能有时效（通常2小时）
   - 建议导出后尽快查看或下载图片

2. **格式保真度**
   - 原格式导出：100% 保真
   - Markdown 导出：约 80% 保真
   - 某些复杂样式会简化

3. **批量导出限制**
   - DOM 解析只能处理当前打开的页面
   - 批量导出多个无权限文档需要逐个打开

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发环境设置

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 构建
npm run build:chrome  # Chrome/Edge/Brave
npm run build:firefox # Firefox
```

## 📄 许可证

MIT License - 与原项目保持一致

## 🙏 致谢

- 原插件作者：[三此君 (sancijun)](https://github.com/sancijun)
- DOM 解析灵感：[cloud-document-converter](https://github.com/whale4113/cloud-document-converter)
- 增强版开发：Claude Code

## 📝 更新日志

### v1.0.3-enhanced (2026-06-25)

#### 新增
- ✨ DOM 解析 Fallback 功能
- ✨ 独立 Markdown 导出按钮
- ✨ 详细的导出统计报告

#### 修复
- 🐛 修复层级导出不完整的问题
- 🐛 修复文件夹树形结构构建错误

#### 改进
- 💄 增强错误提示和用户反馈
- 📝 完善文档和使用说明

## 📮 联系方式

- 原项目问题：请访问 [原仓库](https://github.com/sancijun/feishu-doc-helper)
- 增强版问题：请在本仓库提 Issue

---

**免责声明**：本工具仅用于个人学习和备份目的，请遵守飞书的服务条款和文档所有者的权限设置。
