'use strict';
import { Iterables } from '../system';
import { ExtensionContext, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { CommitNode } from './commitNode';
import { ExplorerNode, ResourceType } from './explorerNode';
import { GitService, GitUri } from '../gitService';

export class FileHistoryNode extends ExplorerNode {

    static readonly rootType: ResourceType = 'file-history';
    readonly resourceType: ResourceType = 'file-history';

    constructor(uri: GitUri, context: ExtensionContext, git: GitService) {
        super(uri, context, git);
     }

    async getChildren(): Promise<CommitNode[]> {
        const log = await this.git.getLogForFile(this.uri.repoPath, this.uri.fsPath, this.uri.sha);
        if (log === undefined) return [];

        return [...Iterables.map(log.commits.values(), c => new CommitNode(c, this.uri, this.context, this.git))];
    }

    getTreeItem(): TreeItem {
        const item = new TreeItem(`History of ${this.uri.getFormattedPath()}`, TreeItemCollapsibleState.Expanded);
        item.contextValue = this.resourceType;
        return item;
    }
}