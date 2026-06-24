# Pull Request 说明

## 🎯 改进概述

这个 PR 为飞书文档助手添加了三个重要的增强功能：

1. **修复层级导出不完整问题**
2. **新增 DOM 解析 Markdown Fallback**
3. **新增独立的 Markdown 导出按钮**

---

## 📋 详细改进

### 1. 修复层级导出不完整 🐛

**问题**：
- 批量导出时，选择包含多层嵌套的文件夹，只能导出顶层文件
- 子文件夹中的文件会被遗漏

**根本原因**：
- 导出逻辑未递归收集子节点
- 文件夹添加顺序错误导致树形结构不完整

**解决方案**：
```typescript
// 添加递归收集函数
const collectAllTokens = (node: TreeDataNode, tokenSet: Set<string>) => {
    if (node.type === 'file' && node.obj_token) {
        tokenSet.add(node.obj_token);
    }
    if (node.children && node.children.length > 0) {
        node.children.forEach(child => collectAllTokens(child, tokenSet));
    }
};

// 修复文件夹添加顺序（export-service.ts）
// 先添加文件夹到列表，再递归获取子内容
folderList.push({ path, obj_token, name, parentToken, url });
await getFileList(node.obj_token, path, fileList, folderList, node.obj_token);
```

---

### 2. 新增 DOM 解析 Markdown Fallback ✨

**问题**：
- 飞书的权限系统将"查看权限"和"导出权限"分开
- 即使能在网页查看文档，也可能无法通过 API 导出

**解决方案**：
创建了 `markdown-fallback.ts` 模块，实现完整的 DOM 解析功能：

```typescript
export async function extractDocumentAsMarkdown(): Promise<MarkdownExportResult | null> {
    // 1. 检查是否是飞书文档页面
    // 2. 获取文档标题
    // 3. 获取文档内容容器
    // 4. 递归转换为 Markdown
}
```

**支持的元素**：
- ✅ 标题（H1-H6）
- ✅ 段落和文本格式（粗体、斜体、删除线）
- ✅ 列表（有序、无序、嵌套）
- ✅ 引用块
- ✅ 代码块和行内代码
- ✅ 表格
- ✅ 图片和链接
- ✅ 水平分隔线

**工作流程**：
```
批量导出时遇到权限错误
    ↓
自动检测是否是权限问题
    ↓
尝试使用 DOM 解析 Fallback
    ↓
提取页面内容 → 转换为 Markdown → 添加到导出包
```

---

### 3. 新增独立 Markdown 导出按钮 ✨

**功能**：
在工具栏添加一个新按钮，直接导出当前页面为 Markdown

**优势**：
- ✅ 无需任何导出权限
- ✅ 即时导出，无需等待
- ✅ 适合快速导出单个文档

**使用方式**：
```
打开飞书文档 → 点击 📄 按钮 → 自动下载 .md 文件
```

---

### 4. 增强错误处理和统计 📊

**改进**：
- 详细的成功/失败统计
- 清晰的失败原因说明
- 区分权限错误和其他错误

**导出结果示例**：
```
⚠️ 部分导出成功
成功: 15 个，失败: 3 个

失败原因：
• 文档A: 权限不足，已使用Markdown格式导出
• 文档B: 没有导出权限（需要在文档页面导出）
• 文档C: 下载失败
```

---

## 📁 修改的文件

### 新增文件
- `src/services/markdown-fallback.ts` - DOM 解析核心模块
- `ENHANCED_README.md` - 增强版功能说明

### 修改文件
- `src/contents/content-export.tsx` - 导出逻辑增强
- `src/services/export-service.ts` - 修复文件夹处理
- `src/api/feishu-api.ts` - 增强错误检查
- `build/chrome-mv3-feishu-doc-helper.zip` - 更新构建产物

---

## 🧪 测试建议

### 测试场景 1：层级导出
1. 选择一个包含多层嵌套的文件夹
2. 勾选父文件夹
3. 确认导出
4. 验证 zip 包中包含所有子文件夹的文件

### 测试场景 2：权限 Fallback
1. 尝试导出一个没有权限的文档
2. 观察是否自动 fallback 为 Markdown
3. 检查导出统计中的提示

### 测试场景 3：单页 Markdown 导出
1. 打开任意飞书文档
2. 点击 📄 按钮
3. 验证下载的 .md 文件内容完整性

---

## ⚠️ 注意事项

### 关于权限
- DOM 解析不是"破解"权限
- 只提取网页上已经显示的内容
- 等同于用户手动复制粘贴
- 不调用任何未授权的 API

### 已知限制
- 图片链接可能有时效（飞书限制）
- Markdown 格式保真度约 80%
- 某些复杂样式会简化
- DOM 解析只能处理当前打开的页面

---

## 📚 相关资源

- 原项目：https://github.com/sancijun/feishu-doc-helper
- DOM 解析灵感：https://github.com/whale4113/cloud-document-converter
- 详细文档：见 `ENHANCED_README.md`

---

## ✅ Checklist

- [x] 代码已测试
- [x] 文档已更新
- [x] 无破坏性变更
- [x] 遵循原项目代码风格
- [x] 添加了详细的注释

---

**建议合并到 main 分支后，发布为新版本 v1.0.4 或 v1.1.0**
