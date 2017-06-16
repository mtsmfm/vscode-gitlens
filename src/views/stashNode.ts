'use strict';
import { Iterables } from '../system';
import { ExtensionContext, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { ExplorerNode, ResourceType } from './explorerNode';
import { GitService, GitUri } from '../gitService';
import { StashCommitNode } from './stashCommitNode';

export class StashNode extends ExplorerNode {

    static readonly rootType: ResourceType = 'stash-history';
    readonly resourceType: ResourceType = 'stash-history';

    constructor(uri: GitUri, context: ExtensionContext, git: GitService) {
        super(uri, context, git);
     }

    async getChildren(): Promise<StashCommitNode[]> {
        const stash = await this.git.getStashList(this.uri.repoPath!);
        if (stash === undefined) return [];

        return [...Iterables.map(stash.commits.values(), c => new StashCommitNode(c, this.uri, this.context, this.git))];
    }

    getTreeItem(): TreeItem {
        const item = new TreeItem(`Stashed Changes`, TreeItemCollapsibleState.Collapsed);
        item.contextValue = this.resourceType;
        return item;
    }
}