'use strict';
import { Strings } from '../../system';
import { Uri } from 'vscode';
import { GlyphChars } from '../../constants';
import { Git } from '../git';
import { GitUri } from '../gitUri';
import * as path from 'path';

export interface GitAuthor {
    name: string;
    lineCount: number;
}

export interface GitCommitLine {
    sha: string;
    previousSha?: string;
    line: number;
    originalLine: number;
    code?: string;
}

export type GitCommitType = 'blame' | 'branch' | 'file'  | 'stash';

export class GitCommit {

    type: GitCommitType;
    originalFileName?: string;
    previousSha?: string;
    previousFileName?: string;
    workingFileName?: string;
    private _isUncommitted: boolean | undefined;

    constructor(
        type: GitCommitType,
        public repoPath: string,
        public sha: string,
        public fileName: string,
        public author: string,
        public date: Date,
        public message: string,
        originalFileName?: string,
        previousSha?: string,
        previousFileName?: string
    ) {
        this.type = type;
        this.fileName = this.fileName && this.fileName.replace(/, ?$/, '');

        this.originalFileName = originalFileName;
        this.previousSha = previousSha;
        this.previousFileName = previousFileName;
    }

    get shortSha() {
        return this.sha.substring(0, 8);
    }

    get isUncommitted(): boolean {
        if (this._isUncommitted === undefined) {
            this._isUncommitted = Git.isUncommitted(this.sha);
        }
        return this._isUncommitted;
    }

    get previousShortSha() {
        return this.previousSha && this.previousSha.substring(0, 8);
    }

    get previousUri(): Uri {
        return this.previousFileName ? Uri.file(path.resolve(this.repoPath, this.previousFileName)) : this.uri;
    }

    get uri(): Uri {
        return Uri.file(path.resolve(this.repoPath, this.originalFileName || this.fileName));
    }

    getFormattedPath(separator: string = Strings.pad(GlyphChars.Dot, 2, 2)): string {
        return GitUri.getFormattedPath(this.fileName, separator);
    }

    with(changes: { type?: GitCommitType, fileName?: string, sha?: string, originalFileName?: string, previousFileName?: string, previousSha?: string }) {
        return new GitCommit(changes.type || this.type, this.repoPath,
            changes.sha || this.sha, changes.fileName || this.fileName,
            this.author, this.date, this.message,
            changes.originalFileName || this.originalFileName,
            changes.previousSha || this.previousSha, changes.previousFileName || this.previousFileName);
    }
}