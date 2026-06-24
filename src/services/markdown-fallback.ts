/**
 * Markdown Fallback - DOM 解析方案（支持批量）
 * 当遇到导出权限错误时，从网页 DOM 提取内容并转换为 Markdown
 */

export interface MarkdownExportResult {
    markdown: string;
    title: string;
}

/**
 * 清理文本中的零宽字符和不可见字符
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


/**
 * 在新标签页中打开文档并提取 Markdown
 * @param url 文档 URL
 * @param fileName 文件名（用于显示进度）
 * @returns Markdown 导出结果
 */
export async function extractFromUrl(url: string, fileName: string): Promise<MarkdownExportResult | null> {
    return new Promise((resolve) => {
        console.log(`[extractFromUrl] 正在打开文档: ${fileName}`);

        // 在新标签页打开文档
        const newTab = window.open(url, '_blank');

        if (!newTab) {
            console.error('[extractFromUrl] 无法打开新标签页，可能被浏览器拦截');
            resolve(null);
            return;
        }

        // 等待页面加载完成
        const checkInterval = setInterval(() => {
            try {
                // 检查新标签页是否加载完成
                if (newTab.document && newTab.document.readyState === 'complete') {
                    clearInterval(checkInterval);

                    // 等待额外的时间让飞书的 JS 渲染内容
                    setTimeout(() => {
                        try {
                            const result = extractDocumentFromWindow(newTab);
                            newTab.close(); // 提取完成后关闭标签页
                            resolve(result);
                        } catch (error) {
                            console.error('[extractFromUrl] 提取内容失败:', error);
                            newTab.close();
                            resolve(null);
                        }
                    }, 2000); // 等待 2 秒确保内容渲染
                }
            } catch (error) {
                // 跨域问题或其他错误
                console.error('[extractFromUrl] 检查页面状态失败:', error);
                clearInterval(checkInterval);
                if (newTab && !newTab.closed) {
                    newTab.close();
                }
                resolve(null);
            }
        }, 500);

        // 超时保护（30秒）
        setTimeout(() => {
            clearInterval(checkInterval);
            if (newTab && !newTab.closed) {
                console.warn('[extractFromUrl] 提取超时，关闭标签页');
                newTab.close();
            }
            resolve(null);
        }, 30000);
    });
}

/**
 * 从指定 window 对象中提取文档内容
 */
function extractDocumentFromWindow(win: Window): MarkdownExportResult | null {
    const doc = win.document;

    // 检查是否是飞书文档页面
    const isDocPage = win.location.hostname.includes('feishu.cn') &&
                     (win.location.pathname.includes('/docx/') ||
                      win.location.pathname.includes('/wiki/'));

    if (!isDocPage) {
        console.warn('[extractDocumentFromWindow] 不是飞书文档页面');
        return null;
    }

    // 获取文档标题
    const title = getDocumentTitleFromDoc(doc);

    // 获取文档内容容器
    const contentContainer = getContentContainerFromDoc(doc);
    if (!contentContainer) {
        console.warn('[extractDocumentFromWindow] 找不到文档内容容器');
        return null;
    }

    // 转换为 Markdown
    const markdown = convertToMarkdown(contentContainer, title);

    return {
        markdown,
        title
    };
}

/**
 * 从当前页面提取文档并转换为 Markdown
 */
export async function extractDocumentAsMarkdown(): Promise<MarkdownExportResult | null> {
    try {
        return extractDocumentFromWindow(window);
    } catch (error) {
        console.error('[extractDocumentAsMarkdown] 提取失败:', error);
        return null;
    }
}

/**
 * 获取文档标题
 */
function getDocumentTitleFromDoc(doc: Document): string {
    // 尝试多种方式获取标题
    const selectors = [
        '.doc-title',
        '.suite-title-bar__title',
        'h1.title',
        '[data-testid="doc-title"]',
        '.wiki-title'
    ];

    for (const selector of selectors) {
        const element = doc.querySelector(selector);
        if (element) {
            const text = (element as HTMLElement).innerText || element.textContent || '';
            const cleaned = cleanText(text);
            if (cleaned) {
                return cleaned;
            }
        }
    }

    // 回退到页面标题
    const title = doc.title.split('-')[0].trim() || 'Untitled';
    return cleanText(title);
}

/**
 * 获取文档内容容器
 */
function getContentContainerFromDoc(doc: Document): HTMLElement | null {
    // 飞书文档的内容容器选择器
    const selectors = [
        '.doc-content',
        '.editor-content',
        '[data-zone="contenteditable"]',
        '.docx-content',
        '.wiki-content',
        // 更通用的选择器
        '[class*="editor"]',
        '[class*="content"]'
    ];

    for (const selector of selectors) {
        const element = doc.querySelector(selector);
        if (element && element.textContent && element.textContent.trim().length > 0) {
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

    return cleanMarkdown(markdown);
}

/**
 * 处理单个节点
 */
function processNode(node: Node, depth: number = 0): string {
    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim() || '';
        return text ? text + ' ' : '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();

    // 跳过隐藏元素和脚本
    if (element.style.display === 'none' ||
        element.hidden ||
        tagName === 'script' ||
        tagName === 'style') {
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
            if (headingText) {
                result = '\n' + '#'.repeat(level) + ' ' + headingText + '\n\n';
            }
            break;

        // 段落
        case 'p':
            const paragraphText = processInlineElements(element);
            if (paragraphText.trim()) {
                result = paragraphText + '\n\n';
            }
            break;

        // 块级 div（检查是否是段落容器）
        case 'div':
            const divText = processInlineElements(element);
            if (divText.trim()) {
                // 如果div包含块级子元素，递归处理
                if (element.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, pre, blockquote, table')) {
                    for (const child of Array.from(element.childNodes)) {
                        result += processNode(child, depth);
                    }
                } else {
                    result = divText + '\n\n';
                }
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

        // 引用
        case 'blockquote':
            const quoteText = processInlineElements(element);
            if (quoteText.trim()) {
                result = '\n> ' + quoteText.replace(/\n/g, '\n> ') + '\n\n';
            }
            break;

        // 代码块
        case 'pre':
            const code = element.querySelector('code');
            const codeText = code ? code.textContent : element.textContent;
            if (codeText) {
                result = '\n```\n' + codeText + '\n```\n\n';
            }
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
            if (src) {
                result = `![${alt}](${src})`;
            }
            break;

        // 链接
        case 'a':
            const linkText = getTextContent(element);
            const href = element.getAttribute('href') || '';
            if (linkText && href) {
                result = `[${linkText}](${href})`;
            } else if (linkText) {
                result = linkText;
            }
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
                case 'u':
                    result += `<u>${text}</u>`;
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
                    result += '  \n';
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

        if (text.trim()) {
            result += `${indent}${marker} ${text.trim()}\n`;
        }

        // 处理嵌套列表
        const nestedList = item.querySelector(':scope > ul, :scope > ol');
        if (nestedList) {
            const isOrdered = nestedList.tagName.toLowerCase() === 'ol';
            result += processListItems(nestedList as HTMLElement, isOrdered, depth + 1);
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

    if (headers.length > 0) {
        markdown += '| ' + headers.join(' | ') + ' |\n';
        markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
    }

    // 处理数据行
    for (let i = 1; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll('td'));
        if (cells.length > 0) {
            const cellTexts = cells.map(cell => getTextContent(cell as HTMLElement).trim() || ' ');
            markdown += '| ' + cellTexts.join(' | ') + ' |\n';
        }
    }

    return markdown;
}

/**
 * 获取元素的文本内容
 */
function getTextContent(element: HTMLElement): string {
    // 优先使用 innerText，它更接近用户看到的内容
    const text = element.innerText || element.textContent || '';
    return cleanText(text);
}

/**
 * 清理 Markdown 文本
 */
function cleanMarkdown(markdown: string): string {
    // 清理零宽字符
    markdown = cleanText(markdown);
    // 移除多余的空行（超过2个连续换行）
    return markdown.replace(/\n{3,}/g, '\n\n').trim();
}
