import React, { useEffect, useState } from 'react';
import { Button, Tooltip, Modal, Tree, notification, Progress } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShareFromSquare } from '@fortawesome/free-regular-svg-icons';
import { faRefresh, faFileLines, faFileExcel, faFolder } from '@fortawesome/free-solid-svg-icons';
import type { PlasmoCSConfig } from 'plasmo';
import { getTreeData, loadAllFileList } from '../services/export-service';
import { extractDocumentAsMarkdown, extractFromUrl } from '../services/markdown-fallback';
import type { TreeDataNode } from '../types/feishu';
import { getFileExtensionByObjType, getFileTypeByObjType } from '../utils/common';
import { createExportTask, download, waitForExportResult } from '../api/feishu-api';
import { getCurrentTimestamp, getLocalStorageData, sleep } from '../utils/common';
import type { FeishuFile } from '../types/feishu';
import JSZip from 'jszip';
import saveAs from 'file-saver';

import '../styles/content-menu.css';
import { analytics } from '../utils/baidu-analytics';

export const config: PlasmoCSConfig = {
    matches: ["https://*.feishu.cn/drive/*", "https://*.feishu.cn/wiki/*"],
    run_at: "document_idle"
};

export const getRootContainer = async () => {
    let referenceElement;
    for (let retryCount = 0; retryCount < 50 && !referenceElement; retryCount++) {
        await sleep(500);
        referenceElement = document.querySelector('.new-notice-wrapper') || document.querySelector('.suite-notice-center');
        console.log('getRootContainer: 查找挂载点', referenceElement);
    }
    const menuContainer = document.createElement('div');
    referenceElement.insertAdjacentElement('afterend', menuContainer);
    return menuContainer;
};

const Menu: React.FC = () => {

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [treeData, setTreeData] = useState<TreeDataNode[]>([]);
    const [checkedKeys, setCheckedKeys] = useState<React.Key[]>([]);
    const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [api, contextHolder] = notification.useNotification();

    /**
     * 递归收集节点及其所有子节点中的文件 token
     */
    const collectAllFileTokens = (node: TreeDataNode, tokenSet: Set<string>) => {
        // 如果是文件节点，添加其 token
        if (node.type === 'file' && node.obj_token) {
            tokenSet.add(node.obj_token);
        }
        // 递归处理子节点
        if (node.children && node.children.length > 0) {
            node.children.forEach(child => collectAllFileTokens(child, tokenSet));
        }
    };

    /**
     * 根据选中的 keys 收集所有需要导出的文件 token
     */
    const collectExportTokens = (checkedKeys: string[], treeData: TreeDataNode[]): Set<string> => {
        console.log('collectExportTokens: 开始收集，checkedKeys 数量:', checkedKeys.length);
        const tokenSet = new Set<string>();

        // 递归查找树节点
        const findAndCollect = (nodes: TreeDataNode[]) => {
            nodes.forEach(node => {
                if (checkedKeys.includes(node.key as string)) {
                    // 找到选中的节点，收集它及其所有子节点的文件 token
                    console.log('collectExportTokens: 找到选中节点', node.title, 'key:', node.key);
                    collectAllFileTokens(node, tokenSet);
                }
                // 继续在子节点中查找
                if (node.children && node.children.length > 0) {
                    findAndCollect(node.children);
                }
            });
        };

        findAndCollect(treeData);
        console.log('collectExportTokens: 收集完成，共', tokenSet.size, '个文件 token');
        return tokenSet;
    };

    /**
     * 导出选定的文档
     */
    async function onExportDocs(selectedTokens: string[]) {
        console.log('onExportDocs: 开始导出，选定的 tokens:', selectedTokens);
        analytics.trackPageView('/export/start', '开始导出');
        const zip = new JSZip();

        try {
            const fileList = await getLocalStorageData('feishuFileList') as FeishuFile[];
            console.log('onExportDocs: 从缓存获取文件列表', fileList);

            // 使用递归收集函数获取所有需要导出的文件 token
            const exportTokenSet = collectExportTokens(selectedTokens, treeData);
            console.log('onExportDocs: 收集到的所有文件 tokens:', Array.from(exportTokenSet));

            const exportList = fileList.filter((file: FeishuFile) => exportTokenSet.has(file.obj_token));
            console.log(`onExportDocs: 待导出的文件列表，共 ${exportList.length} 个`, exportList);

            api.info({
                key: 'export-progress',
                message: '正在准备导出...',
                description: `共 ${exportList.length} 个文件`,
                duration: 0,
            });

            let count = 0;
            let successCount = 0;
            let failedCount = 0;
            const failedFiles: Array<{name: string, reason: string}> = [];
            const batchSize = 2;

            for (let i = 0; i < exportList.length; i += batchSize) {
                const batch = exportList.slice(i, i + batchSize);
                await Promise.all(batch.map(async (file) => {
                    const percent = Math.round(((++count) / exportList.length) * 100);
                    api.info({
                        key: 'export-progress',
                        message: `正在导出 (${count}/${exportList.length})`,
                        description: <>
                            <div>{file.name}</div>
                            <Progress percent={percent} />
                        </>,
                        duration: 0,
                    });

                    try {
                        // 尝试使用 API 导出
                        const taskId = await createExportTask({
                            token: file.obj_token,
                            obj_type: file.obj_type
                        });
                        console.log(`onExportDocs: 创建导出任务成功，文件: ${file.name}, 任务ID: ${taskId}`);

                        if (taskId) {
                            const result = await waitForExportResult(taskId, file.obj_token, file.obj_type);
                            console.log(`onExportDocs: 获取导出结果成功，文件: ${file.name}`, result);

                            if (result && result.url) {
                                const fileContent = await download(result.url, result.type);
                                if (fileContent) {
                                    const folderPath = file.path || '';
                                    const fileName = `${file.name}.${result.type}`;
                                    const fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;
                                    zip.file(fullPath, fileContent);
                                    console.log(`onExportDocs: 文件 ${fileName} 已添加到 zip`);
                                    successCount++;
                                } else {
                                    failedCount++;
                                    failedFiles.push({name: file.name, reason: '下载失败'});
                                }
                            } else {
                                failedCount++;
                                failedFiles.push({name: file.name, reason: '获取导出结果失败'});
                            }
                        } else {
                            failedCount++;
                            failedFiles.push({name: file.name, reason: '创建导出任务失败'});
                        }
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : '未知错误';
                        const isPermissionError = errorMsg.includes('权限') || errorMsg.includes('permission');

                        console.error(`onExportDocs: 导出文件 ${file.name} 失败`, error);
                        analytics.trackError(`导出文件失败: ${errorMsg}`);

                        // 如果是权限错误，尝试使用 DOM 解析 fallback
                        if (isPermissionError && file.url) {
                            console.log(`尝试使用 DOM 解析 fallback 导出: ${file.name}`);

                            api.info({
                                key: 'export-progress',
                                message: `正在尝试 Markdown 导出 (${count}/${exportList.length})`,
                                description: <>
                                    <div>{file.name} (无导出权限，尝试提取页面内容)</div>
                                    <Progress percent={percent} />
                                </>,
                                duration: 0,
                            });

                            try {
                                // 在新标签页打开并提取内容
                                const markdownResult = await extractFromUrl(file.url, file.name);

                                if (markdownResult) {
                                    const folderPath = file.path || '';
                                    const fileName = `${file.name}.md`;
                                    const fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;
                                    const markdownBlob = new Blob([markdownResult.markdown], { type: 'text/markdown' });
                                    zip.file(fullPath, markdownBlob);
                                    console.log(`onExportDocs: 使用 DOM 解析导出成功: ${fileName}`);
                                    successCount++;
                                    // 记录为部分成功（格式降级）
                                    failedFiles.push({name: file.name, reason: '⚠️ 权限不足，已导出为Markdown格式'});
                                } else {
                                    failedCount++;
                                    failedFiles.push({name: file.name, reason: `${errorMsg}（DOM提取也失败）`});
                                }
                            } catch (fallbackError) {
                                console.error('DOM fallback 失败:', fallbackError);
                                failedCount++;
                                failedFiles.push({name: file.name, reason: errorMsg});
                            }
                        } else {
                            failedCount++;
                            failedFiles.push({name: file.name, reason: errorMsg});
                        }
                    }
                }));
            }

            console.log('onExportDocs: 所有文件处理完成，开始生成 zip 文件');
            console.log(`导出统计: 成功 ${successCount} 个，失败 ${failedCount} 个`);

            if (successCount > 0) {
                const content = await zip.generateAsync({ type: 'blob' });
                saveAs(content, `飞书文档导出-${getCurrentTimestamp()}.zip`);
                console.log('onExportDocs: zip 文件生成并保存成功');
                analytics.trackPageView('/export/success', '导出成功');
            }

            // 显示导出结果
            const markdownFallbackCount = failedFiles.filter(f => f.reason.includes('Markdown')).length;

            if (failedCount === 0) {
                api.success({
                    key: 'export-progress',
                    message: '导出完成',
                    description: `全部 ${exportList.length} 个文档已成功导出！`,
                    duration: 5,
                });
            } else if (successCount === 0) {
                api.error({
                    key: 'export-progress',
                    message: '导出失败',
                    description: <>
                        <div>所有文件导出失败！</div>
                        <div style={{marginTop: '8px', fontSize: '12px'}}>
                            {failedFiles.slice(0, 3).map((f, idx) => (
                                <div key={idx}>• {f.name}: {f.reason}</div>
                            ))}
                            {failedFiles.length > 3 && <div>... 等 {failedFiles.length} 个文件</div>}
                        </div>
                    </>,
                    duration: 0,
                });
            } else {
                const warningOrSuccess = markdownFallbackCount > 0 ? 'warning' : 'success';
                api[warningOrSuccess]({
                    key: 'export-progress',
                    message: markdownFallbackCount > 0 ? '部分降级导出' : '导出完成',
                    description: <>
                        <div>成功: {successCount} 个，失败: {failedCount} 个</div>
                        {markdownFallbackCount > 0 && (
                            <div style={{marginTop: '4px', fontSize: '12px', color: '#fa8c16'}}>
                                {markdownFallbackCount} 个文件因权限不足，已导出为 Markdown 格式
                            </div>
                        )}
                        {failedFiles.filter(f => !f.reason.includes('Markdown')).length > 0 && (
                            <div style={{marginTop: '8px', fontSize: '12px'}}>
                                <div>完全失败的文件：</div>
                                {failedFiles.filter(f => !f.reason.includes('Markdown')).slice(0, 3).map((f, idx) => (
                                    <div key={idx}>• {f.name}: {f.reason}</div>
                                ))}
                            </div>
                        )}
                    </>,
                    duration: 0,
                });
            }
        } catch (error) {
            console.error('onExportDocs: 导出过程中发生严重错误', error);
            analytics.trackError('导出过程中发生严重错误');
            api.error({
                key: 'export-progress',
                message: '导出失败',
                description: '导出过程中发生错误，请检查控制台日志。'
            });
        }
    }

    /**
     * 导出当前页面为 Markdown
     */
    const exportCurrentPageAsMarkdown = async () => {
        console.log('exportCurrentPageAsMarkdown: 开始导出当前页面');
        analytics.trackPageView('/export-markdown/start', '开始导出 Markdown');

        try {
            api.info({
                key: 'markdown-export',
                message: '正在导出为 Markdown...',
                description: '从页面提取内容中',
                duration: 0,
            });

            const result = await extractDocumentAsMarkdown();

            if (result) {
                const { markdown, title } = result;
                const blob = new Blob([markdown], { type: 'text/markdown' });
                saveAs(blob, `${title}-${getCurrentTimestamp()}.md`);

                console.log('exportCurrentPageAsMarkdown: 导出成功');
                analytics.trackPageView('/export-markdown/success', '导出 Markdown 成功');

                api.success({
                    key: 'markdown-export',
                    message: '导出成功',
                    description: `文档 "${title}" 已导出为 Markdown 格式`,
                    duration: 3,
                });
            } else {
                throw new Error('无法从当前页面提取内容');
            }
        } catch (error) {
            console.error('exportCurrentPageAsMarkdown: 导出失败', error);
            analytics.trackError('导出 Markdown 失败');

            api.error({
                key: 'markdown-export',
                message: '导出失败',
                description: error instanceof Error ? error.message : '未知错误',
                duration: 5,
            });
        }
    };

    /**
     * 显示模态框
     */
    const showModal = async () => {
        console.log('showModal: 显示模态框');
        await loadDataAndShowModal();
    };

    /**
     * 加载数据并显示模态框
     */
    const loadDataAndShowModal = async () => {
        console.log('loadDataAndShowModal: 开始加载数据');
        setIsLoading(true);
        try {
            // 检查是否有缓存的数据
            const cachedTreeData = await getLocalStorageData('feishuTreeData') as TreeDataNode[] | null;
            console.log('loadDataAndShowModal: 从缓存获取 treeData', cachedTreeData);

            if (cachedTreeData && cachedTreeData.length > 0) {
                console.log('loadDataAndShowModal: 使用缓存的 treeData');
                setTreeData(cachedTreeData);
                setIsModalOpen(true);
            } else {
                console.log('loadDataAndShowModal: 缓存为空，开始加载数据');
                api['info']({
                    key: 'loading notification',
                    message: '文档批量导出',
                    description: '正在加载文件列表，请稍候...',
                    duration: 0,
                });

                await loadAllFileList();
                const newTreeData = await getTreeData();
                console.log('loadDataAndShowModal: 加载完成，获取新的 treeData', newTreeData);

                setTreeData(newTreeData);
                setIsModalOpen(true);

                api['success']({
                    key: 'loading notification',
                    message: '文档批量导出',
                    description: '文件列表加载完成',
                    duration: 3,
                });
            }
        } catch (error) {
            console.error('loadDataAndShowModal: 加载失败', error);
            analytics.trackError('加载文件列表失败');
            api['error']({
                key: 'loading notification',
                message: '文档批量导出',
                description: '数据加载失败，请稍后重试',
                duration: 5,
            });
        } finally {
            setIsLoading(false);
            console.log('loadDataAndShowModal: 加载过程结束');
        }
    };

    /**
     * 模态框确认按钮
     */
    const handleOk = () => {
        setIsModalOpen(false);
        console.log('handleOk: 确认导出，选中的 keys:', checkedKeys);
        if (!checkedKeys.length) {
            console.log('handleOk: 未选择任何文件，操作取消');
            return;
        }

        onExportDocs(checkedKeys.map(key => key.toString()));
    };

    /**
     * 模态框取消按钮
     */
    const handleCancel = () => {
        console.log('handleCancel: 取消导出');
        setIsModalOpen(false);
        setCheckedKeys([]);
    };

    /**
     * 刷新文件列表
     */
    const handleRefresh = async () => {
        console.log('handleRefresh: 开始刷新文件列表');
        setIsRefreshing(true);
        try {
            await new Promise<void>(resolve => chrome.storage.local.remove(['lastLoadTime', 'feishuFileList', 'feishuFolderList', 'feishuTreeData'], () => resolve()));
            console.log('handleRefresh: 已清除本地缓存');

            api['info']({
                key: 'refresh notification',
                message: '刷新文件列表',
                description: '正在重新加载文件列表，请稍候...',
                duration: 0,
            });

            await loadAllFileList();
            const newTreeData = await getTreeData();
            console.log('handleRefresh: 刷新完成，获取新的 treeData', newTreeData);

            setTreeData(newTreeData);
            setCheckedKeys([]);

            api['success']({
                key: 'refresh notification',
                message: '刷新完成',
                description: '文件列表已更新',
                duration: 3,
            });
        } catch (error) {
            console.error('handleRefresh: 刷新失败', error);
            analytics.trackError('刷新文件列表失败');
            api['error']({
                key: 'refresh notification',
                message: '刷新失败',
                description: '刷新失败，请稍后重试',
                duration: 5,
            });
        } finally {
            setIsRefreshing(false);
        }
    };

    /**
     * Tree 组件 check 事件处理
     */
    const onCheck = (checkedKeysValue: any) => {
        console.log('onCheck: 选中项变化', checkedKeysValue);
        // Ant Design Tree 可能返回对象或数组
        const keys = Array.isArray(checkedKeysValue) ? checkedKeysValue : checkedKeysValue.checked;
        console.log('onCheck: 提取的 keys', keys);
        setCheckedKeys(keys);
    };

    /**
     * Tree 组件 select 事件处理
     */
    const onSelect = (selectedKeysValue: React.Key[]) => {
        console.log('onSelect: 选中项变化', selectedKeysValue);
        setSelectedKeys(selectedKeysValue);
    };

    return (
        <>
            {contextHolder}
            <Tooltip placement="bottom" title='批量导出'>
                <Button
                    type="text"
                    onClick={showModal}
                    icon={<FontAwesomeIcon icon={faShareFromSquare} />}
                    style={{
                        marginLeft: '8px',
                        color: 'var(--icon-n2)',
                        height: '28px',
                        width: '28px'
                    }}
                    loading={isLoading}
                    disabled={isLoading}
                />
            </Tooltip>
            <Tooltip placement="bottom" title='导出当前页为Markdown'>
                <Button
                    type="text"
                    onClick={exportCurrentPageAsMarkdown}
                    icon={<FontAwesomeIcon icon={faFileLines} />}
                    style={{
                        marginLeft: '8px',
                        color: 'var(--icon-n2)',
                        height: '28px',
                        width: '28px'
                    }}
                />
            </Tooltip>
            <Modal
                title={
                    <div style={{ display: 'flex' }}>
                        <span style={{ fontSize: '16px', fontWeight: '600' }}>选择要导出的文件</span>
                        <Tooltip title="刷新文件列表">
                            <Button
                                type="text"
                                icon={<FontAwesomeIcon icon={faRefresh} />}
                                onClick={handleRefresh}
                                loading={isRefreshing}
                                style={{ color: 'var(--icon-n2)'}}
                            />
                        </Tooltip>
                    </div>
                }
                open={isModalOpen}
                onOk={handleOk}
                okText='确认'
                onCancel={handleCancel}
                cancelText='取消'
                width={600}
                style={{ top: 20 }}
            >
                <div style={{ maxHeight: '400px', overflow: 'auto', marginTop: '15px', marginBottom: '15px' }}>
                    <Tree
                        checkable
                        onCheck={onCheck}
                        checkedKeys={checkedKeys}
                        onSelect={onSelect}
                        selectedKeys={selectedKeys}
                        treeData={treeData}
                        showIcon={true}
                        defaultExpandAll={false}
                        height={350}
                        itemHeight={28}
                        blockNode={true}
                        titleRender={(node: any) => {
                            let icon;
                            if (node.type === 'folder') {
                                icon = faFolder;
                            } else {
                                const fileType = getFileExtensionByObjType(node.obj_type);
                                if (fileType === 'docx') {
                                    icon = faFileLines;
                                } else if (fileType === 'xlsx') {
                                    icon = faFileExcel;
                                }
                            }
                            return (
                                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                    {icon && <FontAwesomeIcon icon={icon} style={{ marginRight: 8, color: 'var(--icon-n2)', flexShrink: 0 }} />}
                                    <span style={{ color: 'inherit', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {node.title || '未命名'}
                                    </span>
                                </div>
                            );
                        }}
                    />
                </div>
            </Modal>

        </>
    );
};

export default Menu;
