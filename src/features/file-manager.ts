import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { playSoundIfPresent, playSound } from "../utils/sound-manager";
import { LightningTreeItem } from "../providers/lightning-data-provider";
import {
  LightningConfiguration,
  LightningDiff,
  LightningFileCompareButton,
  LightningFileDiffButton,
  LightningFileLink,
  LightningFileMenu,
  LightningFileRefButton,
  LightningItem,
} from "../lightning-types";

type EditorButtonConfig = {
  sourceFilePath: string;
  diffButtons?: LightningFileDiffButton[];
  refButtons?: LightningFileRefButton[];
  compareButtons?: LightningFileCompareButton[];
};

type EditorRefTarget =
  | { type: "ref"; refButton: LightningFileRefButton }
  | { type: "worktree" };

type EditorLightningTarget =
  | { type: "applyDiff"; diffButton: LightningFileDiffButton }
  | { type: "compareRefs"; compareButton: LightningFileCompareButton }
  | EditorRefTarget;

const execFileAsync = promisify(execFile);
let getLightningConfiguration:
  | (() => LightningConfiguration | undefined)
  | undefined;

const gitSnapshotScheme = "lightning-git";

class GitSnapshotContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const query = new URLSearchParams(uri.query);
    const workspaceRoot = query.get("workspaceRoot");
    const gitRef = query.get("gitRef");
    const filePath = query.get("filePath");

    if (!workspaceRoot || !gitRef || !filePath) {
      throw new Error("Missing Lightning git snapshot parameters");
    }

    const { stdout } = await execFileAsync(
      "git",
      ["show", `${gitRef}:${filePath}`],
      {
        cwd: workspaceRoot,
        maxBuffer: 20 * 1024 * 1024,
      },
    );

    return stdout;
  }
}

export function initializeEditorDiffButtons(
  context: vscode.ExtensionContext,
  getConfiguration?: () => LightningConfiguration | undefined,
  onConfigurationChanged?: vscode.Event<unknown>,
): void {
  getLightningConfiguration = getConfiguration;
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      gitSnapshotScheme,
      new GitSnapshotContentProvider(),
    ),
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateEditorDiffButtonContext),
  );
  if (onConfigurationChanged) {
    context.subscriptions.push(
      onConfigurationChanged(() =>
        updateEditorDiffButtonContext(vscode.window.activeTextEditor),
      ),
    );
  }
  updateEditorDiffButtonContext(vscode.window.activeTextEditor);
}

export async function openFile(item: LightningFileLink) {
  // Play sound if present
  await playSoundIfPresent(item);

  try {
    let resolvedPath = item.path;

    // If the path is relative, resolve it against the workspace root
    if (!path.isAbsolute(item.path)) {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        resolvedPath = path.resolve(workspaceFolder.uri.fsPath, item.path);
      } else {
        vscode.window.showErrorMessage(
          "No workspace folder found to resolve relative path",
        );
        return;
      }
    }

    const uri = vscode.Uri.file(resolvedPath);

    if (item.gitRef) {
      const editor = await openGitSnapshotFile(item, resolvedPath);
      applyFilePresentationOptions(editor, item);
      return;
    }

    // Check if this is an image or binary file
    const extension = path.extname(resolvedPath).toLowerCase();
    const imageExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".bmp",
      ".svg",
      ".webp",
      ".ico",
    ];
    const binaryExtensions = [
      ".pdf",
      ".zip",
      ".tar",
      ".gz",
      ".exe",
      ".dll",
      ".so",
      ".dylib",
    ];

    if (
      imageExtensions.includes(extension) ||
      binaryExtensions.includes(extension)
    ) {
      // Use VS Code's default file opening behavior for images and binary files
      await vscode.commands.executeCommand("vscode.open", uri);
    } else {
      // For text files, use showTextDocument to support line numbers
      const editor = await vscode.window.showTextDocument(uri);
      applyFilePresentationOptions(editor, item);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open file: ${item.path}`);
  }
}

async function openGitSnapshotFile(
  item: LightningFileLink,
  resolvedPath: string,
): Promise<vscode.TextEditor> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error("No workspace folder found for git snapshot");
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  const gitPath = getWorkspaceGitPath(workspaceRoot, resolvedPath);
  const uri = getGitSnapshotUri(
    workspaceRoot,
    gitPath,
    item.gitRef || "",
    item.tabSuffix || `at ${item.gitRef || ""}`,
  );

  const document = await vscode.workspace.openTextDocument(uri);
  const languageId = getLanguageIdForPath(gitPath);
  if (languageId) {
    await vscode.languages.setTextDocumentLanguage(document, languageId);
  }
  return vscode.window.showTextDocument(document, { preview: false });
}

function getLanguageIdForPath(filePath: string): string | undefined {
  switch (path.posix.extname(filePath).toLowerCase()) {
    case ".css":
      return "css";
    case ".html":
      return "html";
    case ".js":
    case ".cjs":
    case ".mjs":
      return "javascript";
    case ".json":
      return "json";
    case ".jsonc":
      return "jsonc";
    case ".md":
      return "markdown";
    case ".ts":
      return "typescript";
    case ".tsx":
      return "typescriptreact";
    case ".jsx":
      return "javascriptreact";
    case ".yml":
    case ".yaml":
      return "yaml";
    default:
      return undefined;
  }
}

function getGitSnapshotDisplayPath(gitPath: string, tabSuffix: string): string {
  const directory = path.posix.dirname(gitPath);
  const fileName = path.posix.basename(gitPath);
  const safeTabSuffix = tabSuffix.replace(/[\\/:*?"<>|]/g, "_");
  const displayFileName = `${fileName} - ${safeTabSuffix}`;

  return directory === "."
    ? displayFileName
    : path.posix.join(directory, displayFileName);
}

function getGitSnapshotUri(
  workspaceRoot: string,
  gitPath: string,
  gitRef: string,
  tabSuffix: string,
): vscode.Uri {
  const displayPath = getGitSnapshotDisplayPath(gitPath, tabSuffix);
  const query = new URLSearchParams({
    workspaceRoot,
    gitRef,
    filePath: gitPath,
  });

  return vscode.Uri.from({
    scheme: gitSnapshotScheme,
    authority: "snapshot",
    path: `/${displayPath}`,
    query: query.toString(),
  });
}

function getWorkspaceGitPath(workspaceRoot: string, filePath: string): string {
  const relativePath = path.relative(workspaceRoot, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Git snapshot file must be inside the workspace");
  }

  return relativePath.split(path.sep).join(path.posix.sep);
}

function applyFilePresentationOptions(
  editor: vscode.TextEditor,
  item: LightningFileLink,
): void {
  if (item.line !== undefined && item.line > 0) {
    const position = new vscode.Position(item.line - 1, 0);
    const range = new vscode.Range(position, position);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  }

  if (item.highlightStartLine === undefined) {
    return;
  }

  const startLine = Math.max(0, item.highlightStartLine - 1);
  const endLine = item.highlightEndLine
    ? Math.max(0, item.highlightEndLine - 1)
    : startLine;

  const highlightRange = new vscode.Range(
    new vscode.Position(startLine, 0),
    new vscode.Position(endLine, Number.MAX_SAFE_INTEGER),
  );

  if (item.highlightType === "selection") {
    editor.selection = new vscode.Selection(
      highlightRange.start,
      highlightRange.end,
    );
    editor.revealRange(highlightRange, vscode.TextEditorRevealType.InCenter);
    return;
  }

  const decorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: item.highlightColor || "rgba(255, 255, 0, 0.3)",
    border: "1px solid rgba(255, 255, 0, 0.8)",
    isWholeLine: true,
  });

  editor.setDecorations(decorationType, [highlightRange]);

  const duration =
    item.highlightDuration !== undefined ? item.highlightDuration : 5000;
  if (duration > 0) {
    setTimeout(() => {
      decorationType.dispose();
    }, duration);
  }
}

export async function openActiveEditorLightningButton(): Promise<void> {
  const activeConfig = getActiveEditorButtonConfig();
  if (!activeConfig) {
    vscode.window.showInformationMessage("No Lightning actions configured");
    return;
  }

  const target = await pickActiveEditorLightningTarget(activeConfig);
  if (!target) {
    return;
  }

  if (target.type === "applyDiff") {
    await applyDiff(toLightningDiff(target.diffButton));
    return;
  }

  if (target.type === "compareRefs") {
    await openGitRefComparison(target.compareButton, activeConfig);
    return;
  }

  await openEditorRefTarget(target, activeConfig);
}

async function openGitRefComparison(
  compareButton: LightningFileCompareButton,
  activeConfig: EditorButtonConfig,
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage(
      "No workspace folder found for git operations",
    );
    return;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  const gitPath = getWorkspaceGitPath(
    workspaceRoot,
    activeConfig.sourceFilePath,
  );
  const fromUri = getGitSnapshotUri(
    workspaceRoot,
    gitPath,
    compareButton.fromGitRef,
    compareButton.fromTabSuffix || compareButton.fromGitRef,
  );
  const toUri = getGitSnapshotUri(
    workspaceRoot,
    gitPath,
    compareButton.toGitRef,
    compareButton.toTabSuffix || compareButton.toGitRef,
  );
  const languageId = getLanguageIdForPath(gitPath);
  if (languageId) {
    await vscode.languages.setTextDocumentLanguage(
      await vscode.workspace.openTextDocument(fromUri),
      languageId,
    );
    await vscode.languages.setTextDocumentLanguage(
      await vscode.workspace.openTextDocument(toUri),
      languageId,
    );
  }

  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  await vscode.commands.executeCommand(
    "vscode.diff",
    fromUri,
    toUri,
    compareButton.title || compareButton.label,
  );
}

async function openEditorRefTarget(
  refTarget: EditorRefTarget,
  activeConfig: EditorButtonConfig,
): Promise<void> {
  if (refTarget.type === "worktree") {
    const didDiscardChanges = await discardWorktreeFileChanges(
      activeConfig.sourceFilePath,
    );
    if (!didDiscardChanges) {
      return;
    }

    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    await openFile({
      type: "file",
      label: path.basename(activeConfig.sourceFilePath),
      path: activeConfig.sourceFilePath,
      diffButtons: activeConfig.diffButtons,
      refButtons: activeConfig.refButtons,
      compareButtons: activeConfig.compareButtons,
    });
    return;
  }

  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

  await openFile({
    type: "file",
    label: refTarget.refButton.label,
    path: activeConfig.sourceFilePath,
    gitRef: refTarget.refButton.gitRef,
    tabSuffix: refTarget.refButton.tabSuffix,
    icon: refTarget.refButton.icon,
    diffButtons: activeConfig.diffButtons,
    refButtons: activeConfig.refButtons,
    compareButtons: activeConfig.compareButtons,
  });
}

async function discardWorktreeFileChanges(
  sourceFilePath: string,
): Promise<boolean> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage(
      "No workspace folder found for git operations",
    );
    return false;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  const relativePath = path.relative(workspaceRoot, sourceFilePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    vscode.window.showErrorMessage(
      "Cannot discard changes for a file outside the workspace",
    );
    return false;
  }

  const gitPath = relativePath.split(path.sep).join(path.posix.sep);
  try {
    await execFileAsync(
      "git",
      ["restore", "--staged", "--worktree", "--", gitPath],
      { cwd: workspaceRoot },
    );
    return true;
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to discard changes: ${path.basename(sourceFilePath)}`,
    );
    return false;
  }
}

export async function closeFile(treeItem: LightningTreeItem) {
  if (treeItem.lightningItem?.type === "file") {
    const filePath = treeItem.lightningItem.path;

    try {
      let resolvedPath = filePath;

      // If the path is relative, resolve it against the workspace root
      if (!path.isAbsolute(filePath)) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
          resolvedPath = path.resolve(workspaceFolder.uri.fsPath, filePath);
        } else {
          vscode.window.showErrorMessage(
            "No workspace folder found to resolve relative path",
          );
          return;
        }
      }

      const uri = vscode.Uri.file(resolvedPath);

      // Find and close any open tab with this file
      const tabGroups = vscode.window.tabGroups;
      for (const tabGroup of tabGroups.all) {
        for (const tab of tabGroup.tabs) {
          // Check for different tab input types
          let tabUri: vscode.Uri | undefined;

          if (tab.input instanceof vscode.TabInputText) {
            // Text files (code, markdown, etc.)
            tabUri = tab.input.uri;
          } else if (tab.input instanceof vscode.TabInputCustom) {
            // Custom editors (some image viewers, etc.)
            tabUri = tab.input.uri;
          } else if (
            tab.input &&
            typeof tab.input === "object" &&
            "uri" in tab.input
          ) {
            // Generic check for any tab input with a uri property
            tabUri = (tab.input as any).uri;
          }

          if (tabUri && tabUri.fsPath === uri.fsPath) {
            await vscode.window.tabGroups.close(tab);
            // Play close sound on successful file close
            if (
              treeItem.lightningItem &&
              treeItem.lightningItem.type === "file" &&
              treeItem.lightningItem.closeSoundPath
            ) {
              playSound(treeItem.lightningItem.closeSoundPath);
            }
            return;
          }
        }
      }

      // If no tab was found, show a message
      vscode.window.showInformationMessage(
        `File "${path.basename(filePath)}" is not currently open`,
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to close file: ${filePath}`);
    }
  }
}

export async function applyDiff(item: LightningDiff) {
  // Play sound if present
  await playSoundIfPresent(item);

  const diffPath = item.diffPath;
  const action = item.action;

  try {
    let resolvedPath = diffPath;

    // If the path is relative, resolve it against the workspace root
    if (!path.isAbsolute(diffPath)) {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        resolvedPath = path.resolve(workspaceFolder.uri.fsPath, diffPath);
      } else {
        vscode.window.showErrorMessage(
          "No workspace folder found to resolve relative path",
        );
        return;
      }
    }

    // Check if the diff file exists
    try {
      await fs.promises.access(resolvedPath);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Diff file not found: ${path.basename(diffPath)}`,
      );
      return;
    }

    // Get the workspace root for git commands
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage(
        "No workspace folder found for git operations",
      );
      return;
    }

    // Determine action - use provided action or show confirmation dialog
    let selectedAction = action;

    if (!selectedAction) {
      // For toggle behavior, always try to apply first
      selectedAction = "apply";
    }

    if (selectedAction === "apply") {
      // Execute git apply command with toggle behavior
      const { exec } = require("child_process");
      const workingDir = workspaceFolder.uri.fsPath;

      await focusFirstDiffTarget(resolvedPath, workingDir);

      // First try to apply the diff
      exec(
        `git apply "${resolvedPath}"`,
        { cwd: workingDir },
        (error: any, stdout: string, stderr: string) => {
          if (error) {
            // Apply failed, try to revert instead
            exec(
              `git apply --reverse "${resolvedPath}"`,
              { cwd: workingDir },
              (
                revertError: any,
                revertStdout: string,
                revertStderr: string,
              ) => {
                if (revertError) {
                  // Both apply and revert failed, show error
                  vscode.window.showErrorMessage(
                    `Failed to apply diff: ${error.message}\nFailed to revert diff: ${revertError.message}`,
                  );
                } else {
                  // Revert succeeded
                  if (item.revertSoundPath) {
                    playSound(item.revertSoundPath);
                  }
                  vscode.window.showInformationMessage(
                    `Reverted diff: ${path.basename(diffPath)}`,
                  );
                }
              },
            );
          } else {
            // Apply succeeded
            vscode.window.showInformationMessage(
              `Applied diff: ${path.basename(diffPath)}`,
            );
          }
        },
      );
    } else if (selectedAction === "preview") {
      // Open the diff file for preview
      const uri = vscode.Uri.file(resolvedPath);
      await vscode.window.showTextDocument(uri);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to process diff: ${diffPath}`);
  }
}

export async function revertDiff(treeItem: LightningTreeItem) {
  if (treeItem.lightningItem?.type === "diff") {
    await revertDiffItem(treeItem.lightningItem);
  }
}

export async function revertDiffItem(item: LightningDiff) {
  const diffPath = item.diffPath;

  try {
    let resolvedPath = diffPath;

    // If the path is relative, resolve it against the workspace root
    if (!path.isAbsolute(diffPath)) {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        resolvedPath = path.resolve(workspaceFolder.uri.fsPath, diffPath);
      } else {
        vscode.window.showErrorMessage(
          "No workspace folder found to resolve relative path",
        );
        return;
      }
    }

    // Check if the diff file exists
    try {
      await fs.promises.access(resolvedPath);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Diff file not found: ${path.basename(diffPath)}`,
      );
      return;
    }

    // Get the workspace root for git commands
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage(
        "No workspace folder found for git operations",
      );
      return;
    }

    // Execute git apply --reverse command immediately
    const { exec } = require("child_process");
    const workingDir = workspaceFolder.uri.fsPath;

    await focusFirstDiffTarget(resolvedPath, workingDir);

    exec(
      `git apply --reverse "${resolvedPath}"`,
      { cwd: workingDir },
      (error: any, stdout: string, stderr: string) => {
        if (error) {
          vscode.window.showErrorMessage(
            `Failed to revert diff: ${error.message}\n${stderr}`,
          );
        } else {
          // Play revert sound on success
          if (item.revertSoundPath) {
            playSound(item.revertSoundPath);
          }
          vscode.window.showInformationMessage(
            `Successfully reverted diff: ${path.basename(diffPath)}`,
          );
        }
      },
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to revert diff: ${diffPath}`);
  }
}

function updateEditorDiffButtonContext(
  editor: vscode.TextEditor | undefined,
): void {
  const activeConfig = getEditorButtonConfig(editor);
  const diffButtonsVisible = Boolean(activeConfig?.diffButtons?.length);
  const refButtonsVisible = Boolean(activeConfig?.refButtons?.length);
  const compareButtonsVisible = Boolean(activeConfig?.compareButtons?.length);
  vscode.commands.executeCommand(
    "setContext",
    "lightning.editorLightningButtonsVisible",
    diffButtonsVisible || refButtonsVisible || compareButtonsVisible,
  );
}

function getActiveEditorButtonConfig(): EditorButtonConfig | undefined {
  return getEditorButtonConfig(vscode.window.activeTextEditor);
}

function getEditorButtonConfig(
  editor: vscode.TextEditor | undefined,
): EditorButtonConfig | undefined {
  if (!editor) {
    return undefined;
  }

  const sourceFilePath = getSourceFilePath(editor.document.uri);
  if (!sourceFilePath) {
    return undefined;
  }

  return getConfiguredEditorButtonConfig(sourceFilePath);
}

function getSourceFilePath(uri: vscode.Uri): string | undefined {
  if (uri.scheme === "file") {
    return uri.fsPath;
  }

  if (uri.scheme === gitSnapshotScheme) {
    const query = new URLSearchParams(uri.query);
    const workspaceRoot = query.get("workspaceRoot");
    const filePath = query.get("filePath");
    return workspaceRoot && filePath
      ? path.resolve(workspaceRoot, filePath)
      : undefined;
  }

  return undefined;
}

function getConfiguredEditorButtonConfig(
  sourceFilePath: string,
): EditorButtonConfig | undefined {
  const configuration = getLightningConfiguration?.();
  if (!configuration) {
    return undefined;
  }

  const normalizedSourcePath = path.normalize(sourceFilePath);
  const diffButtons: LightningFileDiffButton[] = [];
  const refButtons: LightningFileRefButton[] = [];
  const compareButtons: LightningFileCompareButton[] = [];

  collectEditorButtonsFromMenus(
    configuration.fileMenus || [],
    normalizedSourcePath,
    diffButtons,
    refButtons,
    compareButtons,
  );
  collectEditorButtonsForPath(
    configuration.items,
    normalizedSourcePath,
    diffButtons,
    refButtons,
    compareButtons,
  );

  if (
    diffButtons.length === 0 &&
    refButtons.length === 0 &&
    compareButtons.length === 0
  ) {
    return undefined;
  }

  return {
    sourceFilePath: normalizedSourcePath,
    diffButtons: diffButtons.length > 0 ? diffButtons : undefined,
    refButtons: refButtons.length > 0 ? refButtons : undefined,
    compareButtons: compareButtons.length > 0 ? compareButtons : undefined,
  };
}

function collectEditorButtonsFromMenus(
  fileMenus: LightningFileMenu[],
  sourceFilePath: string,
  diffButtons: LightningFileDiffButton[],
  refButtons: LightningFileRefButton[],
  compareButtons: LightningFileCompareButton[],
): void {
  for (const fileMenu of fileMenus) {
    const menuPath = resolveWorkspacePath(fileMenu.path);
    if (!menuPath || path.normalize(menuPath) !== sourceFilePath) {
      continue;
    }

    diffButtons.push(...(fileMenu.diffButtons || []));
    refButtons.push(...(fileMenu.refButtons || []));
    compareButtons.push(...(fileMenu.compareButtons || []));
  }
}

function collectEditorButtonsForPath(
  items: LightningItem[],
  sourceFilePath: string,
  diffButtons: LightningFileDiffButton[],
  refButtons: LightningFileRefButton[],
  compareButtons: LightningFileCompareButton[],
): void {
  for (const item of items) {
    if (item.type === "folder") {
      collectEditorButtonsForPath(
        item.items,
        sourceFilePath,
        diffButtons,
        refButtons,
        compareButtons,
      );
      continue;
    }

    if (item.type !== "file") {
      continue;
    }

    const itemPath = resolveWorkspacePath(item.path);
    if (!itemPath || path.normalize(itemPath) !== sourceFilePath) {
      continue;
    }

    diffButtons.push(...(item.diffButtons || []));
    refButtons.push(...(item.refButtons || []));
    compareButtons.push(...(item.compareButtons || []));
  }
}

function resolveWorkspacePath(filePath: string): string | undefined {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  return workspaceFolder
    ? path.resolve(workspaceFolder.uri.fsPath, filePath)
    : undefined;
}

async function pickActiveEditorLightningTarget(
  activeConfig: EditorButtonConfig,
): Promise<EditorLightningTarget | undefined> {
  const diffButtons = activeConfig.diffButtons || [];
  const refButtons = activeConfig.refButtons || [];
  const compareButtons = activeConfig.compareButtons || [];

  const selected = await vscode.window.showQuickPick(
    [
      ...diffButtons.map((diffButton) => ({
        label: `$(${diffButton.icon || "git-pull-request"}) ${diffButton.label}`,
        description: "Apply or revert diff",
        target: { type: "applyDiff", diffButton } as EditorLightningTarget,
      })),
      ...refButtons.map((refButton) => ({
        label: `$(${refButton.icon || "git-commit"}) ${refButton.label}`,
        description: refButton.gitRef,
        target: { type: "ref", refButton } as EditorLightningTarget,
      })),
      ...compareButtons.map((compareButton) => ({
        label: `$(${compareButton.icon || "diff"}) ${compareButton.label}`,
        description: `${compareButton.fromGitRef} -> ${compareButton.toGitRef}`,
        target: {
          type: "compareRefs",
          compareButton,
        } as EditorLightningTarget,
      })),
      ...(refButtons.length > 0
        ? [
            {
              label: "$(discard) Discard changes and open worktree file",
              description: "Reset file to HEAD",
              target: { type: "worktree" } as EditorLightningTarget,
            },
          ]
        : []),
    ],
    { placeHolder: "Lightning action" },
  );

  return selected?.target;
}

function toLightningDiff(diffButton: LightningFileDiffButton): LightningDiff {
  return {
    type: "diff",
    label: diffButton.label,
    diffPath: diffButton.diffPath,
    action: "apply",
    icon: diffButton.icon,
    revertSoundPath: diffButton.revertSoundPath,
  };
}

async function focusFirstDiffTarget(
  diffFilePath: string,
  workspaceRoot: string,
): Promise<void> {
  const targetPath = await getFirstDiffTarget(diffFilePath);
  if (!targetPath) {
    return;
  }

  const resolvedTargetPath = path.resolve(workspaceRoot, targetPath);
  try {
    const document =
      await vscode.workspace.openTextDocument(resolvedTargetPath);
    await vscode.window.showTextDocument(document, { preview: false });
  } catch (error) {
    await vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.file(resolvedTargetPath),
    );
  }
}

async function getFirstDiffTarget(
  diffFilePath: string,
): Promise<string | undefined> {
  const diffContent = await fs.promises.readFile(diffFilePath, "utf8");
  const targetLine = diffContent
    .split(/\r?\n/)
    .find((line) => line.startsWith("+++ b/"));

  if (!targetLine) {
    return undefined;
  }

  const targetPath = targetLine.substring("+++ b/".length).trim();
  return targetPath === "/dev/null" ? undefined : targetPath;
}
