/**
 * Markdown Fallback - DOM 解析方案
 * 当遇到导出权限错误时，从网页 DOM 提取内容并转换为 Markdown
 */

export interface MarkdownExportResult {
    markdown: string;
    title: string;
}

/**
 * 从飞书文档页面提取内容并转换为 Markdown
 */
export async function extractDocumentAsMarkdown(): Promise<MarkdownExportResult | null> {
    try {
        // 检查是否是飞书文档页面
        const isDocPage = window.location.hostname.includes('feishu.cn') &&
                         (window.location.pathname.includes('/docx/') ||
                          window.location.pathname.includes('/wiki/'));

        if (!isDocPage) {
            console.warn('Not a Feishu document page');
            return null;
        }

        // 获取文档标题
        const title = getDocumentTitle();

        // 获取文档内容容器
        const contentContainer = getContentContainer();
        if (!contentContainer) {
            console.warn('Cannot find document content container');
            return null;
        }

        // 转换为 Markdown
        const markdown = convertToMarkdown(contentContainer, title);

        return {
            markdown,
            title
        };
    } catch (error) {
        console.error('Failed to extract document as markdown:', error);
        return null;
    }
}

/**
 * 获取文档标题
 */
function getDocumentTitle(): string {
    // 尝试多种方式获取标题
    const selectors = [
        '.doc-title',
        '.suite-title-bar__title',
        'h1.title',
        '[data-testid="doc-title"]',
        '.wiki-title'
    ];

    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent) {
            return element.textContent.trim();
        }
    }

    // 回退到页面标题
    return document.title.split('-')[0].trim() || 'Untitled';
}

/**
 * 获取文档内容容器
 */
function getContentContainer(): HTMLElement | null {
    // 飞书文档的内容容器选择器
    const selectors = [
        '.doc-content',
        '.editor-content',
        '[data-zone="contenteditable"]',
        '.docx-content',
        '.wiki-content'
    ];

    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
            return element as HTMLElement;
        }
    }

    return null;
}

/**
 * 将 DOM 元素转换为 Markdown
 */
function convertToMarkdown(container: HTMLElement, title: string): string {
    let markdown = `# ${title}\n\n`;

    // 递归处理所有子节点
    markdown += processNode(container);

    return markdown.trim();
}

/**
 * 处理单个节点
 */
function processNode(node: Node, depth: number = 0): string {
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent?.trim() || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();

    // 跳过隐藏元素
    if (element.style.display === 'none' || element.hidden) {
        return '';
    }

    let result = '';

    switch (tagName) {
        // 标题
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
            const level = parseInt(tagName[1]);
            const headingText = getTextContent(element);
            result = '\n' + '#'.repeat(level) + ' ' + headingText + '\n\n';
            break;

        // 段落
        case 'p':
        case 'div':
            const paragraphText = processInlineElements(element);
            if (paragraphText.trim()) {
                result = paragraphText + '\n\n';
            }
            break;

        // 无序列表
        case 'ul':
            result = '\n' + processListItems(element, false, depth) + '\n';
            break;

        // 有序列表
        case 'ol':
            result = '\n' + processListItems(element, true, depth) + '\n';
            break;

        // 列表项
        case 'li':
            // 由 processListItems 处理
            break;

        // 引用
        case 'blockquote':
            const quoteText = processInlineElements(element);
            result = '\n> ' + quoteText.replace(/\n/g, '\n> ') + '\n\n';
            break;

        // 代码块
        case 'pre':
            const code = element.querySelector('code');
            const codeText = code ? code.textContent : element.textContent;
            result = '\n```\n' + (codeText || '') + '\n```\n\n';
            break;

        // 水平线
        case 'hr':
            result = '\n---\n\n';
            break;

        // 表格
        case 'table':
            result = '\n' + processTable(element) + '\n';
            break;

        // 图片
        case 'img':
            const alt = element.getAttribute('alt') || 'image';
            const src = element.getAttribute('src') || element.getAttribute('data-src') || '';
            result = `![${alt}](${src})`;
            break;

        // 链接
        case 'a':
            const linkText = getTextContent(element);
            const href = element.getAttribute('href') || '';
            result = `[${linkText}](${href})`;
            break;

        // 其他元素，递归处理子节点
        default:
            for (const child of Array.from(element.childNodes)) {
                result += processNode(child, depth);
            }
            break;
    }

    return result;
}

/**
 * 处理行内元素（粗体、斜体、删除线等）
 */
function processInlineElements(element: HTMLElement): string {
    let result = '';

    for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
            result += child.textContent || '';
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            const childElement = child as HTMLElement;
            const tagName = childElement.tagName.toLowerCase();
            const text = getTextContent(childElement);

            switch (tagName) {
                case 'strong':
                case 'b':
                    result += `**${text}**`;
                    break;
                case 'em':
                case 'i':
                    result += `*${text}*`;
                    break;
                case 'del':
                case 's':
                    result += `~~${text}~~`;
                    break;
                case 'code':
                    result += `\`${text}\``;
                    break;
                case 'a':
                    const href = childElement.getAttribute('href') || '';
                    result += `[${text}](${href})`;
                    break;
                case 'img':
                    const alt = childElement.getAttribute('alt') || 'image';
                    const src = childElement.getAttribute('src') || childElement.getAttribute('data-src') || '';
                    result += `![${alt}](${src})`;
                    break;
                case 'br':
                    result += '\n';
                    break;
                default:
                    result += processInlineElements(childElement);
                    break;
            }
        }
    }

    return result;
}

/**
 * 处理列表项
 */
function processListItems(list: HTMLElement, ordered: boolean, depth: number): string {
    const items = Array.from(list.querySelectorAll(':scope > li'));
    let result = '';

    items.forEach((item, index) => {
        const indent = '  '.repeat(depth);
        const marker = ordered ? `${index + 1}.` : '-';
        const text = processInlineElements(item as HTMLElement);

        result += `${indent}${marker} ${text}\n`;

        // 处理嵌套列表
        const nestedList = item.querySelector('ul, ol');
        if (nestedList) {
            result += processNode(nestedList, depth + 1);
        }
    });

    return result;
}

/**
 * 处理表格
 */
function processTable(table: HTMLElement): string {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length === 0) return '';

    let markdown = '';
    const headers: string[] = [];

    // 处理表头
    const headerRow = rows[0];
    const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
    headerCells.forEach(cell => {
        headers.push(getTextContent(cell as HTMLElement).trim() || ' ');
    });

    markdown += '| ' + headers.join(' | ') + ' |\n';
    markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

    // 处理数据行
    for (let i = 1; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll('td'));
        const cellTexts = cells.map(cell => getTextContent(cell as HTMLElement).trim() || ' ');
        markdown += '| ' + cellTexts.join(' | ') + ' |\n';
    }

    return markdown;
}

/**
 * 获取元素的文本内容
 */
function getTextContent(element: HTMLElement): string {
    return element.textContent?.trim() || '';
}

/**
 * 清理 Markdown 文本
 */
function cleanMarkdown(markdown: string): string {
    // 移除多余的空行
    return markdown.replace(/\n{3,}/g, '\n\n').trim();
}
