'use strict';
// import { Objects } from './system';
import { ExtensionContext, extensions, languages, window, workspace } from 'vscode';
import { AnnotationController } from './annotations/annotationController';
import { CloseUnchangedFilesCommand, OpenChangedFilesCommand } from './commands';
import { OpenBranchInRemoteCommand, OpenCommitInRemoteCommand, OpenFileInRemoteCommand, OpenInRemoteCommand, OpenRepoInRemoteCommand } from './commands';
import { CopyMessageToClipboardCommand, CopyShaToClipboardCommand } from './commands';
import { DiffDirectoryCommand, DiffLineWithPreviousCommand, DiffLineWithWorkingCommand, DiffWithBranchCommand, DiffWithNextCommand, DiffWithPreviousCommand, DiffWithWorkingCommand} from './commands';
import { ResetSuppressedWarningsCommand } from './commands';
import { ShowFileBlameCommand, ShowLineBlameCommand, ToggleFileBlameCommand, ToggleFileRecentChangesCommand, ToggleLineBlameCommand } from './commands';
import { ShowBlameHistoryCommand, ShowFileHistoryCommand } from './commands';
import { ShowLastQuickPickCommand } from './commands';
import { ShowQuickBranchHistoryCommand, ShowQuickCurrentBranchHistoryCommand, ShowQuickFileHistoryCommand } from './commands';
import { ShowCommitSearchCommand, ShowQuickCommitDetailsCommand, ShowQuickCommitFileDetailsCommand } from './commands';
import { ShowQuickRepoStatusCommand, ShowQuickStashListCommand, ShowStashListCommand } from './commands';
import { StashApplyCommand, StashDeleteCommand, StashSaveCommand } from './commands';
import { ToggleCodeLensCommand } from './commands';
import { CodeLensLocations, IConfig, LineHighlightLocations } from './configuration';
import { ApplicationInsightsKey, CommandContext, ExtensionKey, QualifiedExtensionId, setCommandContext, WorkspaceState } from './constants';
import { CurrentLineController, LineAnnotationType } from './currentLineController';
import { GitContentProvider } from './gitContentProvider';
import { GitExplorer } from './views/gitExplorer';
import { GitRevisionCodeLensProvider } from './gitRevisionCodeLensProvider';
import { GitContextTracker, GitService } from './gitService';
import { Keyboard } from './keyboard';
import { Logger } from './logger';
import { Messages, SuppressedKeys } from './messages';
import { Telemetry } from './telemetry';

// this method is called when your extension is activated
export async function activate(context: ExtensionContext) {
    Logger.configure(context);
    Messages.configure(context);
    Telemetry.configure(ApplicationInsightsKey);

    const gitlens = extensions.getExtension(QualifiedExtensionId)!;
    const gitlensVersion = gitlens.packageJSON.version;

    const rootPath = workspace.rootPath && workspace.rootPath.replace(/\\/g, '/');
    Logger.log(`GitLens(v${gitlensVersion}) active: ${rootPath}`);

    const cfg = workspace.getConfiguration().get<IConfig>(ExtensionKey)!;
    const gitPath = cfg.advanced.git;

    try {
        await GitService.getGitPath(gitPath);
    }
    catch (ex) {
        Logger.error(ex, 'Extension.activate');
        if (ex.message.includes('Unable to find git')) {
            await window.showErrorMessage(`GitLens was unable to find Git. Please make sure Git is installed. Also ensure that Git is either in the PATH, or that 'gitlens.advanced.git' is pointed to its installed location.`);
        }
        setCommandContext(CommandContext.Enabled, false);
        return;
    }

    const repoPath = await GitService.getRepoPath(rootPath);

    const gitVersion = GitService.getGitVersion();
    Logger.log(`Git version: ${gitVersion}`);

    const telemetryContext: { [id: string]: any } = Object.create(null);
    telemetryContext.version = gitlensVersion;
    telemetryContext['git.version'] = gitVersion;
    Telemetry.setContext(telemetryContext);

    await migrateSettings(context);
    notifyOnUnsupportedGitVersion(context, gitVersion);
    notifyOnNewGitLensVersion(context, gitlensVersion);

    await context.globalState.update(WorkspaceState.GitLensVersion, gitlensVersion);

    const git = new GitService(context, repoPath);
    context.subscriptions.push(git);

    const gitContextTracker = new GitContextTracker(git);
    context.subscriptions.push(gitContextTracker);

    context.subscriptions.push(workspace.registerTextDocumentContentProvider(GitContentProvider.scheme, new GitContentProvider(context, git)));

    context.subscriptions.push(languages.registerCodeLensProvider(GitRevisionCodeLensProvider.selector, new GitRevisionCodeLensProvider(context, git)));

    const annotationController = new AnnotationController(context, git, gitContextTracker);
    context.subscriptions.push(annotationController);

    const currentLineController = new CurrentLineController(context, git, gitContextTracker, annotationController);
    context.subscriptions.push(currentLineController);

    context.subscriptions.push(new Keyboard());

    let explorer: GitExplorer | undefined = undefined;
    if (cfg.insiders) {
        explorer = new GitExplorer(context, git);
        context.subscriptions.push(window.registerTreeDataProvider('gitlens-explorer', explorer));
    }

    context.subscriptions.push(new CloseUnchangedFilesCommand(git));
    context.subscriptions.push(new OpenChangedFilesCommand(git));
    context.subscriptions.push(new CopyMessageToClipboardCommand(git));
    context.subscriptions.push(new CopyShaToClipboardCommand(git));
    context.subscriptions.push(new DiffDirectoryCommand(git));
    context.subscriptions.push(new DiffLineWithPreviousCommand(git));
    context.subscriptions.push(new DiffLineWithWorkingCommand(git));
    context.subscriptions.push(new DiffWithBranchCommand(git));
    context.subscriptions.push(new DiffWithNextCommand(git));
    context.subscriptions.push(new DiffWithPreviousCommand(git));
    context.subscriptions.push(new DiffWithWorkingCommand(git));
    context.subscriptions.push(new OpenBranchInRemoteCommand(git));
    context.subscriptions.push(new OpenCommitInRemoteCommand(git));
    context.subscriptions.push(new OpenFileInRemoteCommand(git));
    context.subscriptions.push(new OpenInRemoteCommand());
    context.subscriptions.push(new OpenRepoInRemoteCommand(git));
    context.subscriptions.push(new ShowFileBlameCommand(annotationController));
    context.subscriptions.push(new ShowLineBlameCommand(currentLineController));
    context.subscriptions.push(new ToggleFileBlameCommand(annotationController));
    context.subscriptions.push(new ToggleFileRecentChangesCommand(annotationController));
    context.subscriptions.push(new ToggleLineBlameCommand(currentLineController));
    context.subscriptions.push(new ResetSuppressedWarningsCommand(context));
    context.subscriptions.push(new ShowBlameHistoryCommand(git));
    context.subscriptions.push(new ShowFileHistoryCommand(git, explorer));
    context.subscriptions.push(new ShowLastQuickPickCommand());
    context.subscriptions.push(new ShowQuickBranchHistoryCommand(git));
    context.subscriptions.push(new ShowQuickCurrentBranchHistoryCommand(git));
    context.subscriptions.push(new ShowQuickCommitDetailsCommand(git));
    context.subscriptions.push(new ShowQuickCommitFileDetailsCommand(git));
    context.subscriptions.push(new ShowCommitSearchCommand(git));
    context.subscriptions.push(new ShowQuickFileHistoryCommand(git));
    context.subscriptions.push(new ShowQuickRepoStatusCommand(git));
    context.subscriptions.push(new ShowQuickStashListCommand(git));
    if (cfg.insiders) {
        context.subscriptions.push(new ShowStashListCommand(git, explorer!));
    }
    context.subscriptions.push(new StashApplyCommand(git));
    context.subscriptions.push(new StashDeleteCommand(git));
    context.subscriptions.push(new StashSaveCommand(git));
    context.subscriptions.push(new ToggleCodeLensCommand(git));

    // Constantly over my data cap so stop collecting initialized event
    // Telemetry.trackEvent('initialized', Objects.flatten(cfg, 'config', true));
}

// this method is called when your extension is deactivated
export function deactivate() { }

async function migrateSettings(context: ExtensionContext) {
    const previousVersion = context.globalState.get<string>(WorkspaceState.GitLensVersion);
    if (previousVersion === undefined) return;

    const [major] = previousVersion.split('.');
    if (parseInt(major, 10) >= 4) return;

    try {
        const cfg = workspace.getConfiguration(ExtensionKey);
        const prevCfg = workspace.getConfiguration().get<any>(ExtensionKey)!;

        if (prevCfg.blame !== undefined && prevCfg.blame.annotation !== undefined) {
            switch (prevCfg.blame.annotation.activeLine) {
                case 'off':
                    await cfg.update('blame.line.enabled', false, true);
                    break;
                case 'hover':
                    await cfg.update('blame.line.annotationType', LineAnnotationType.Hover, true);
                    break;
            }

            if (prevCfg.blame.annotation.activeLineDarkColor != null) {
                await cfg.update('theme.annotations.line.trailing.dark.foregroundColor', prevCfg.blame.annotation.activeLineDarkColor, true);
            }

            if (prevCfg.blame.annotation.activeLineLightColor != null) {
                await cfg.update('theme.annotations.line.trailing.light.foregroundColor', prevCfg.blame.annotation.activeLineLightColor, true);
            }

            switch (prevCfg.blame.annotation.highlight) {
                case 'none':
                    await cfg.update('blame.file.lineHighlight.enabled', false);
                    break;
                case 'gutter':
                    await cfg.update('blame.file.lineHighlight.locations', [LineHighlightLocations.Gutter, LineHighlightLocations.OverviewRuler], true);
                    break;
                case 'line':
                    await cfg.update('blame.file.lineHighlight.locations', [LineHighlightLocations.Line, LineHighlightLocations.OverviewRuler], true);
                    break;
                case 'both':
            }

            if (prevCfg.blame.annotation.dateFormat != null) {
                await cfg.update('annotations.file.gutter.dateFormat', prevCfg.blame.annotation.dateFormat, true);
                await cfg.update('annotations.line.trailing.dateFormat', prevCfg.blame.annotation.dateFormat, true);
            }
        }

        if (prevCfg.codeLens !== undefined) {
            switch (prevCfg.codeLens.visibility) {
                case 'ondemand':
                case 'off':
                    await cfg.update('codeLens.enabled', false);
            }

            switch (prevCfg.codeLens.location) {
                case 'all':
                    await cfg.update('codeLens.locations', [CodeLensLocations.Document, CodeLensLocations.Containers, CodeLensLocations.Blocks], true);
                    break;
                case 'document+containers':
                    await cfg.update('codeLens.locations', [CodeLensLocations.Document, CodeLensLocations.Containers], true);
                    break;
                case 'document':
                    await cfg.update('codeLens.locations', [CodeLensLocations.Document], true);
                    break;
                case 'custom':
                    await cfg.update('codeLens.locations', [CodeLensLocations.Custom], true);
                    break;
            }

            if (prevCfg.codeLens.locationCustomSymbols != null) {
                await cfg.update('codeLens.customLocationSymbols', prevCfg.codeLens.locationCustomSymbols, true);
            }
        }

        if ((prevCfg.menus && prevCfg.menus.diff && prevCfg.menus.diff.enabled) === false) {
            await cfg.update('advanced.menus', {
                editorContext: {
                    blame: true,
                    copy: true,
                    details: true,
                    fileDiff: false,
                    history: true,
                    lineDiff: false,
                    remote: true
                },
                editorTitle: {
                    blame: true,
                    fileDiff: false,
                    history: true,
                    remote: true,
                    status: true
                },
                editorTitleContext: {
                    blame: true,
                    fileDiff: false,
                    history: true,
                    remote: true
                },
                explorerContext: {
                    fileDiff: false,
                    history: true,
                    remote: true
                }
            }, true);
        }

        switch (prevCfg.statusBar && prevCfg.statusBar.date) {
            case 'off':
                await cfg.update('statusBar.format', '${author}', true);
                break;
            case 'absolute':
                await cfg.update('statusBar.format', '${author}, ${date}', true);
                break;
        }
    }
    catch (ex) {
        Logger.error(ex, 'migrateSettings');
    }
    finally {
        window.showInformationMessage(`GitLens v4 adds many new settings and removes a few old ones, so please review your settings to ensure they are configured properly.`);
    }
}

async function notifyOnNewGitLensVersion(context: ExtensionContext, version: string) {
    if (context.globalState.get(SuppressedKeys.UpdateNotice, false)) return;

    const previousVersion = context.globalState.get<string>(WorkspaceState.GitLensVersion);

    if (previousVersion === undefined) {
        await Messages.showWelcomeMessage();
        return;
    }

    const [major, minor] = version.split('.');
    const [prevMajor, prevMinor] = previousVersion.split('.');
    if (major === prevMajor && minor === prevMinor) return;
    // Don't notify on downgrades
    if (major < prevMajor || (major === prevMajor && minor < prevMinor)) return;

    await Messages.showUpdateMessage(version);
}

async function notifyOnUnsupportedGitVersion(context: ExtensionContext, version: string) {
    if (GitService.validateGitVersion(2, 2)) return;

    // If git is less than v2.2.0
    await Messages.showUnsupportedGitVersionErrorMessage(version);
}