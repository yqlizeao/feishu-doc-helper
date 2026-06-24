/**
 * 飞书文档转 Markdown 转换器
 * 基于原始 cloud-document-converter 仓库的实现
 * 使用飞书页面的 window.PageMain API，不依赖 DOM 解析
 */

/**
 * 飞书块类型枚举
 * @see https://open.feishu.cn/document/client-docs/docs-add-on/06-data-structure/BlockType
 */
export enum BlockType {
    PAGE = 'page',
    TEXT = 'text',
    HEADING1 = 'heading1',
    HEADING2 = 'heading2',
    HEADING3 = 'heading3',
    HEADING4 = 'heading4',
    HEADING5 = 'heading5',
    HEADING6 = 'heading6',
    HEADING7 = 'heading7',
    HEADING8 = 'heading8',
    HEADING9 = 'heading9',
    CODE = 'code',
    BULLET = 'bullet',
    ORDERED = 'ordered',
    TODO = 'todo',
    QUOTE = 'quote',
    QUOTE_CONTAINER = 'quote_container',
    DIVIDER = 'divider',
    IMAGE = 'image',
    FILE = 'file',
    TABLE = 'table',
    GRID = 'grid',
    CALLOUT = 'callout',
}

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
                child.type && child.type.startsWith('heading')
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

    console.log('[convertDocxToMarkdown] rootBlock:', rootBlock);
    console.log('[convertDocxToMarkdown] children:', rootBlock.children);

    // 简化版 Markdown 转换
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
        console.log('[convertBlockToMarkdown] 处理块:', blockType, child);

        // 根据块类型转换
        switch (blockType) {
            case BlockType.HEADING1:
                markdown += `# ${extractText(child)}\n\n`;
                break;
            case BlockType.HEADING2:
                markdown += `## ${extractText(child)}\n\n`;
                break;
            case BlockType.HEADING3:
                markdown += `### ${extractText(child)}\n\n`;
                break;
            case BlockType.HEADING4:
                markdown += `#### ${extractText(child)}\n\n`;
                break;
            case BlockType.HEADING5:
                markdown += `##### ${extractText(child)}\n\n`;
                break;
            case BlockType.HEADING6:
                markdown += `###### ${extractText(child)}\n\n`;
                break;

            case BlockType.TEXT:
                const text = extractText(child);
                if (text.trim()) {
                    markdown += `${text}\n\n`;
                }
                break;

            case BlockType.CODE:
                const codeText = extractText(child);
                const language = (child as any).language || '';
                markdown += `\`\`\`${language}\n${codeText}\n\`\`\`\n\n`;
                break;

            case BlockType.BULLET:
            case BlockType.ORDERED:
                markdown += await convertListItem(child, blockType === BlockType.ORDERED, level);
                break;

            case BlockType.DIVIDER:
                markdown += `---\n\n`;
                break;

            case BlockType.QUOTE:
            case BlockType.QUOTE_CONTAINER:
                const quoteText = extractText(child);
                markdown += `> ${quoteText}\n\n`;
                break;

            // TODO: 添加更多块类型的支持
            // - 表格 (BlockType.TABLE)
            // - 图片 (BlockType.IMAGE)
            // - 文件 (BlockType.FILE)
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
        if (child.children && child.children.length > 0 && blockType !== BlockType.BULLET && blockType !== BlockType.ORDERED) {
            markdown += await convertBlockToMarkdown(child, level + 1);
        }
    }

    return markdown;
}

/**
 * 转换列表项
 */
async function convertListItem(block: any, isOrdered: boolean, level: number): Promise<string> {
    const indent = '  '.repeat(level);
    const text = extractText(block);
    const prefix = isOrdered ? '1. ' : '- ';
    let markdown = `${indent}${prefix}${text}\n`;

    // 递归处理嵌套列表
    if (block.children && block.children.length > 0) {
        for (const child of block.children) {
            markdown += await convertListItem(child, isOrdered, level + 1);
        }
    }

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

    // 如果有 textRun（富文本），提取文本
    if (block.textRun && Array.isArray(block.textRun)) {
        return block.textRun
            .map((run: any) => run.text || '')
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
