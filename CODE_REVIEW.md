# 深度 Code Review 报告

## 严重问题分析

### 问题 1：export-service.ts 的修改是冗余的 ❌

**我的修改**：
```typescript
// 原代码
await getFileList(...);  // 先递归
folderList.push(...);    // 后添加

// 我的修改
folderList.push(...);    // 先添加
await getFileList(...);  // 后递归
```

**分析**：
- `buildTreeStructure` 在所有数据收集完成后才调用
- 它先创建所有文件夹的 Map（第68-86行）
- 然后根据 `parentToken` 建立层级关系（第116-144行）
- **顺序不影响最终结果**

**结论**：这个修改是**不必要的**，应该撤销！

---

### 问题 2：collectExportTokens 逻辑是否必要？需要验证 ⚠️

**原代码**：
```typescript
const exportList = fileList.filter((file: FeishuFile) => 
    selectedTokens.includes(file.obj_token)
);
```

**我的代码**：
```typescript
const exportTokenSet = collectExportTokens(selectedTokens, treeData);
const exportList = fileList.filter((file: FeishuFile) => 
    exportTokenSet.has(file.obj_token)
);
```

**关键问题**：Ant Design Tree 的 `checkedKeys` 在默认情况下（没有 `checkStrictly`）会包含什么？

让我验证：当用户勾选一个父节点时，`checkedKeys` 是否自动包含所有子节点的 keys？

**如果是**：我的递归收集是冗余的
**如果否**：我的递归收集是必要的

---

### 问题 3：DOM 解析 fallback 只能处理当前页面 ❌

**严重限制**：
```typescript
const isCurrentPage = window.location.href.includes(file.obj_token);

if (isCurrentPage) {
    // 只有当前打开的页面才能使用 DOM 解析
}
```

**问题**：
- 批量导出时，大部分文档**不是**当前页面
- 所以这个 fallback 几乎**永远不会被触发**
- 用户看到的还是权限错误！

**实际效果**：
- 批量导出 10 个无权限文档 → 只有当前打开的 1 个能 fallback
- 其他 9 个仍然失败

---

### 问题 4：markdown-fallback.ts 的可靠性需要测试 ⚠️

**我创建的 DOM 解析器**：
```typescript
function getContentContainer(): HTMLElement | null {
    const selectors = [
        '.doc-content',
        '.editor-content',
        '[data-zone="contenteditable"]',
        '.docx-content',
        '.wiki-content'
    ];
    // ...
}
```

**问题**：
1. **选择器是否准确**？我没有实际测试
2. **DOM 结构是否会变化**？飞书可能随时更新
3. **内容提取是否完整**？可能遗漏某些元素

**需要测试**：
- 实际在飞书页面运行
- 检查提取的内容是否完整
- 验证各种元素（表格、列表、代码块）

---

## 正向贡献分析

### ✅ 可能有用的改进

1. **增强的错误处理**：
   ```typescript
   // API 层面检查错误码
   if (json.code !== 0) {
       if (json.code === 403 || json.msg?.includes('权限')) {
           throw new Error(`没有导出权限: ${json.msg}`);
       }
   }
   ```
   这个是**有用的**，能清晰识别权限错误。

2. **详细的导出统计**：
   ```typescript
   let successCount = 0;
   let failedCount = 0;
   const failedFiles: Array<{name: string, reason: string}> = [];
   ```
   这个是**有用的**，提供更好的用户反馈。

3. **独立的 Markdown 导出按钮**：
   ```typescript
   const exportCurrentPageAsMarkdown = async () => {
       const result = await extractDocumentAsMarkdown();
       saveAs(blob, `${title}.md`);
   }
   ```
   这个是**有用的**，可以导出当前打开的页面。

---

## 实际问题验证

让我创建一个测试来验证 Ant Design Tree 的行为：

