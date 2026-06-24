# 飞书文档助手 - 精简增强版

## 📋 版本说明

这是经过深度 Code Review 后的**精简版本**，只保留必要且经过验证的改进。

---

## ✨ 核心改进

### 1. ✅ 增强的 API 错误检查

**文件**：`src/api/feishu-api.ts`

**改进内容**：
```typescript
// 检查响应中的错误代码
if (json.code !== 0) {
    // 识别权限相关的错误码
    if (json.code === 403 || json.code === 90001 || 
        json.msg?.includes('权限') || json.msg?.includes('permission')) {
        throw new Error(`没有导出权限: ${json.msg || '请检查文档权限设置'}`);
    }
    throw new Error(`导出失败: ${json.msg || json.code}`);
}
```

**好处**：
- ✅ 清晰识别权限错误
- ✅ 提供更有用的错误信息
- ✅ 代码侵入性小，风险低

---

### 2. ✅ 智能 DOM Fallback（支持批量）

**文件**：`src/services/markdown-fallback.ts`

**核心功能**：
```typescript
// 在新标签页中打开文档并提取内容
export async function extractFromUrl(url: string, fileName: string): Promise<MarkdownExportResult | null> {
    return new Promise((resolve) => {
        // 1. 在新标签页打开文档
        const newTab = window.open(url, '_blank');
        
        // 2. 等待页面加载完成
        const checkInterval = setInterval(() => {
            if (newTab.document && newTab.document.readyState === 'complete') {
                // 3. 提取内容
                const result = extractDocumentFromWindow(newTab);
                
                // 4. 关闭标签页
                newTab.close();
                
                resolve(result);
            }
        }, 500);
    });
}
```

**工作流程**：
```
批量导出遇到权限错误
    ↓
自动在新标签页打开该文档
    ↓
等待页面加载完成（最多30秒）
    ↓
从 DOM 提取内容并转换为 Markdown
    ↓
关闭标签页
    ↓
将 .md 文件添加到导出包
```

**用户体验**：
- ✅ 看起来仍然是批量导出
- ✅ 自动处理，无需手动操作
- ✅ 失败的文档自动 fallback
- ⚠️ 会短暂看到新标签页打开和关闭

**支持的元素**：
- ✅ 标题（H1-H6）
- ✅ 段落和文本格式（粗体、斜体、删除线）
- ✅ 列表（有序、无序、嵌套）
- ✅ 引用块
- ✅ 代码块
- ✅ 表格
- ✅ 图片（URL）
- ✅ 链接

---

### 3. ✅ 详细的导出统计

**文件**：`src/contents/content-export.tsx`

**统计信息**：
```typescript
let successCount = 0;      // 成功导出数量
let failedCount = 0;       // 失败数量
const failedFiles: Array<{
    name: string,
    reason: string         // 失败原因
}> = [];
```

**三种结果状态**：

#### 全部成功
```
✅ 导出完成
全部 X 个文档已成功导出！
```

#### 部分降级（使用了 Markdown Fallback）
```
⚠️ 部分降级导出
成功: X 个，失败: Y 个

N 个文件因权限不足，已导出为 Markdown 格式

完全失败的文件：
• 文档A: 创建导出任务失败
• 文档B: 下载失败
```

#### 全部失败
```
❌ 导出失败
所有文件导出失败！

• 文档A: 没有导出权限（DOM提取也失败）
• 文档B: 网络错误
```

---

### 4. ✅ 独立 Markdown 导出按钮

**功能**：快速导出当前打开的页面为 Markdown

**使用方法**：
```
打开任意飞书文档 → 点击 📄 按钮 → 自动下载 .md 文件
```

**优势**：
- ✅ 无需任何权限
- ✅ 即时导出
- ✅ 适合单个文档

---

## ❌ 删除的改动

以下改动在深度审查后被认为是不必要的，已从这个版本中删除：

### 1. ❌ export-service.ts 的文件夹顺序修改
**原因**：`buildTreeStructure` 在所有数据收集完后才调用，顺序不影响结果

### 2. ❌ collectExportTokens 递归收集
**原因**：Ant Design Tree 在默认模式下，`checkedKeys` 已经包含所有子节点的 keys

---

## 🔍 与之前版本的对比

| 改动 | 之前版本 | 精简版本 | 说明 |
|------|---------|---------|------|
| export-service.ts | ✅ 修改 | ❌ 未修改 | 文件夹顺序不影响结果 |
| collectExportTokens | ✅ 添加 | ❌ 未添加 | Tree已自动包含子节点 |
| API错误检查 | ✅ 添加 | ✅ 保留 | 有用的改进 |
| DOM Fallback | ⚠️ 仅当前页 | ✅ 支持批量 | 真正可用的fallback |
| 详细统计 | ✅ 添加 | ✅ 保留 | 改进用户体验 |
| 独立MD导出 | ✅ 添加 | ✅ 保留 | 核心功能 |
| 代码行数 | +260行 | +100行 | 更精简 |

---

## 🚀 使用方法

### 安装

1. 在 Chrome 中打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `build/chrome-mv3-feishu-doc-helper` 目录

### 批量导出（带自动 Fallback）

1. 访问飞书云文档
2. 点击 **📤 批量导出** 按钮
3. 选择文件夹和文件
4. 点击"确认"

**自动行为**：
- 有权限的文档 → 原格式（.docx, .xlsx）
- 无权限的文档 → 自动在新标签页打开 → 提取为 Markdown → 关闭标签页

### 单页导出

1. 打开任意飞书文档
2. 点击 **📄 导出当前页为Markdown** 按钮
3. 自动下载 .md 文件

---

## ⚠️ 注意事项

### DOM Fallback 的限制

1. **浏览器可能拦截弹窗**
   - 确保允许飞书网站打开弹窗
   - Chrome设置 → 隐私和安全 → 网站设置 → 弹出式窗口

2. **图片链接时效**
   - 飞书的图片链接可能有时效（2小时）
   - 建议导出后尽快查看

3. **格式保真度**
   - 原格式导出：100%
   - Markdown导出：约80%
   - 复杂样式会简化

4. **性能考虑**
   - 批量导出大量无权限文档时会比较慢
   - 每个文档需要2-5秒（打开→提取→关闭）
   - 建议分批导出

---

## 📝 技术细节

### DOM 提取可靠性

**选择器策略**（从通用到特定）：
```typescript
const selectors = [
    '.doc-content',           // 最常见
    '.editor-content',
    '[data-zone="contenteditable"]',
    '.docx-content',
    '.wiki-content',
    '[class*="editor"]',      // 回退策略
    '[class*="content"]'
];
```

**超时保护**：
- 页面加载超时：30秒
- 超时后自动关闭标签页
- 避免卡死

**错误处理**：
- 跨域错误 → 跳过该文档
- 提取失败 → 记录为失败
- 不影响其他文档的导出

---

## 🧪 测试建议

### 测试场景 1：纯权限导出
```
选择10个有权限的文档 → 全部导出为原格式
```

### 测试场景 2：混合导出
```
选择5个有权限 + 5个无权限 → 
有权限的导出原格式 + 无权限的自动fallback为Markdown
```

### 测试场景 3：纯无权限导出
```
选择10个无权限的文档 → 
观察自动打开新标签页 → 全部导出为Markdown
```

### 测试场景 4：单页导出
```
打开任意文档 → 点击📄按钮 → 检查Markdown内容完整性
```

---

## 🆚 为什么这个版本更好

### vs 原版插件
- ✅ 增强的错误提示
- ✅ 详细的导出统计
- ✅ 支持无权限导出（Markdown）

### vs 之前的增强版
- ✅ 代码更少，更易维护
- ✅ 只保留必要的改动
- ✅ 真正可用的批量 Fallback
- ✅ 更可靠（经过深度审查）

---

## 📚 相关文档

项目中包含以下技术文档：

- `CODE_REVIEW.md` - 深度代码审查报告
- `HONEST_REVIEW.md` - 诚实的改动评估
- `ANALYSIS.md` - 问题分析
- `TRUE_PROBLEM.md` - 真实问题定位

---

## 🤝 贡献

发现问题或有改进建议？欢迎提 Issue 或 Pull Request！

---

## 📄 许可证

MIT License - 与原项目保持一致

---

## 🙏 致谢

- 原插件作者：[三此君](https://github.com/sancijun)
- 深度 Code Review：Claude Code
- 测试反馈：@yqlizeao
