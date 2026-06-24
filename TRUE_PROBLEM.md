# 真相揭示：你遇到的真实问题

## 你的日志分析

```
onCheck: 选中项变化 (191) [...]
collectExportTokens: 收集完成，共 125 个文件 token
```

**191 个节点 vs 125 个文件**

这个差异说明：
- 191 个节点 = **文件夹 + 文件**
- 125 个文件 = 只有**文件**

## 这是正常的！✅

我的 `collectAllTokens` 函数：
```typescript
if (node.type === 'file' && node.obj_token) {
    tokenSet.add(node.obj_token);  // 只收集文件
}
// 文件夹不添加，只递归子节点
```

所以：
- **文件夹节点不会被添加到 tokenSet**
- **只有文件节点被收集**

## 你说的"导出不全"

如果你实际需要导出的文件数量 > 125，那么问题可能是：

### 可能性 1：权限问题导致 ⚠️

你说：
> "策划文件夹路径，发现导出来是空的"

如果这个文件夹里的所有文档都**没有导出权限**，那么：
- API 调用全部失败
- 125 个成功的是其他有权限的文档
- 策划文件夹的文档全部失败

### 可能性 2：fileList 中缺少某些文件 ⚠️

如果 `fileList` 本身就不完整：
```typescript
const exportList = fileList.filter((file: FeishuFile) => 
    exportTokenSet.has(file.obj_token)
);
```

即使 `exportTokenSet` 有 token，但 `fileList` 里找不到对应的文件，也不会导出。

## 我的建议：添加调试日志

在你的环境中添加这些日志：

```typescript
// 在 onExportDocs 开始时
console.log('=== 调试信息 ===');
console.log('1. selectedTokens 数量:', selectedTokens.length);
console.log('2. collectExportTokens 收集到的文件 token 数量:', exportTokenSet.size);
console.log('3. fileList 总数:', fileList.length);
console.log('4. exportList 数量:', exportList.length);

// 检查是否有 token 在 exportTokenSet 但不在 fileList
const missingTokens = Array.from(exportTokenSet).filter(token => 
    !fileList.find(f => f.obj_token === token)
);
console.log('5. 在 exportTokenSet 但不在 fileList 的 tokens:', missingTokens);

// 检查策划文件夹
const cehauaFiles = fileList.filter(f => f.path?.includes('策划'));
console.log('6. 策划相关文件数量:', cehauaFiles.length);
console.log('7. 策划相关文件:', cehauaFiles.map(f => f.name));
```

这样可以准确定位问题！
