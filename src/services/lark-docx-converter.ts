/**
 * 飞书文档转 Markdown 转换器
 * 基于原始 cloud-document-converter 仓库的实现
 * 使用飞书页面的 window.PageMain API，不依赖 DOM 解析
 */

/**
 * 检查当前页面是否为飞书新版文档（Docx）
 */
export function isFeishuDocx(): boolean {
    return typeof window !== 'undefined' && (window as any).PageMain !== undefined;
}

/**
 * 检查当前页面是否为飞书旧版文档（Doc 1.0）
 */
export function isFeishuDoc(): boolean {
    return typeof window !== 'undefined' && (window as any).editor !== undefined;
}

/**
 * 获取飞书页面的用户语言
 */
export function getFeishuLanguage(): string {
    const user = (window as any).User;
    return user?.language || 'zh';
}

/**
 * 获取文档标题
 */
export function getDocumentTitle(): string {
    // 优先从 PageMain 获取
    if ((window as any).PageMain) {
        const rootBlock = (window as any).PageMain.blockManager?.rootBlockModel;
        if (rootBlock) {
            // 从第一个标题块获取标题
            const firstHeading = rootBlock.children?.find((child: any) =>
                child.type >= 2 && child.type <= 10 // Heading1 到 Heading9
            );
            if (firstHeading?.text) {
                return firstHeading.text;
            }
        }
    }

    // 回退到页面标题
    return document.title.split('-')[0].trim() || 'Untitled';
}

/**
 * 检查文档内容是否已加载完成
 */
export async function isDocumentReady(): Promise<boolean> {
    if (!isFeishuDocx()) {
        return false;
    }

    const pageMain = (window as any).PageMain;
    if (!pageMain) {
        return false;
    }

    // 检查基本的块结构是否存在
    const rootBlock = pageMain.blockManager?.rootBlockModel;
    if (!rootBlock || !rootBlock.children || rootBlock.children.length === 0) {
        return false;
    }

    // TODO: 添加更完整的加载检查（白板、图片等）
    return true;
}

/**
 * 将飞书文档转换为 Markdown
 * 这是一个简化版本，完整实现需要复制整个 @dolphin/lark 包
 */
export async function convertDocxToMarkdown(): Promise<string> {
    if (!isFeishuDocx()) {
        throw new Error('当前页面不是飞书新版文档');
    }

    if (isFeishuDoc()) {
        throw new Error('不支持旧版飞书文档（Doc 1.0）');
    }

    const isReady = await isDocumentReady();
    if (!isReady) {
        throw new Error('文档内容尚未加载完成，请稍后重试');
    }

    const pageMain = (window as any).PageMain;
    const rootBlock = pageMain.blockManager?.rootBlockModel;

    if (!rootBlock) {
        throw new Error('无法获取文档内容');
    }

    // 简化版 Markdown 转换
    // TODO: 实现完整的块转换逻辑（参考 cloud-document-converter/packages/lark/src/docx.ts）
    const markdown = await convertBlockToMarkdown(rootBlock);

    return markdown;
}

/**
 * 递归转换块为 Markdown（简化版）
 */
async function convertBlockToMarkdown(block: any, level: number = 0): Promise<string> {
    let markdown = '';

    if (!block || !block.children) {
        return markdown;
    }

    for (const child of block.children) {
        const blockType = child.type;

        // 根据块类型转换
        switch (blockType) {
            case 2: // Heading1
            case 3: // Heading2
            case 4: // Heading3
            case 5: // Heading4
            case 6: // Heading5
            case 7: // Heading6
                const headingLevel = blockType - 1;
                const headingText = extractText(child);
                markdown += `${'#'.repeat(headingLevel)} ${headingText}\n\n`;
                break;

            case 1: // Text/Paragraph
                const text = extractText(child);
                if (text.trim()) {
                    markdown += `${text}\n\n`;
                }
                break;

            case 13: // Code
                const codeText = extractText(child);
                const language = child.language || '';
                markdown += `\`\`\`${language}\n${codeText}\n\`\`\`\n\n`;
                break;

            case 27: // BulletList
            case 28: // OrderedList
                markdown += await convertListToMarkdown(child, blockType === 28);
                break;

            // TODO: 添加更多块类型的支持
            // - 表格 (BlockType.TABLE)
            // - 图片 (BlockType.IMAGE)
            // - 文件 (BlockType.FILE)
            // - 引用块 (BlockType.QUOTE)
            // - 分割线 (BlockType.DIVIDER)
            // 等等...

            default:
                // 未知类型，尝试提取文本
                const unknownText = extractText(child);
                if (unknownText.trim()) {
                    markdown += `${unknownText}\n\n`;
                }
                break;
        }

        // 递归处理子块
        if (child.children && child.children.length > 0) {
            markdown += await convertBlockToMarkdown(child, level + 1);
        }
    }

    return markdown;
}

/**
 * 转换列表块
 */
async function convertListToMarkdown(block: any, isOrdered: boolean): Promise<string> {
    let markdown = '';
    const items = block.children || [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const text = extractText(item);
        const prefix = isOrdered ? `${i + 1}. ` : '- ';
        markdown += `${prefix}${text}\n`;

        // 递归处理嵌套列表
        if (item.children && item.children.length > 0) {
            const nested = await convertListToMarkdown(item, isOrdered);
            markdown += nested.split('\n').map(line => '  ' + line).join('\n') + '\n';
        }
    }

    markdown += '\n';
    return markdown;
}

/**
 * 从块中提取纯文本
 */
function extractText(block: any): string {
    if (!block) return '';

    // 如果有 text 属性，直接返回
    if (block.text) {
        return cleanText(block.text);
    }

    // 如果有 operations（富文本），提取文本
    if (block.operations && Array.isArray(block.operations)) {
        return block.operations
            .map((op: any) => op.insert || '')
            .join('')
            .trim();
    }

    // 如果有 textContent
    if (block.textContent) {
        return cleanText(block.textContent);
    }

    return '';
}

/**
 * 清理文本中的零宽字符
 */
function cleanText(text: string): string {
    if (!text) return '';

    // 移除常见的零宽字符
    text = text.replace(/​/g, ''); // 零宽空格
    text = text.replace(/‌/g, ''); // 零宽非连接符
    text = text.replace(/‍/g, ''); // 零宽连接符
    text = text.replace(/﻿/g, ''); // 零宽非断空格
    text = text.replace(/⁠/g, ''); // 词连接符
    text = text.replace(/­/g, ''); // 软连字符

    // 移除控制字符 (U+0000 到 U+001F，除了常见的换行符)
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    return text.trim();
}
