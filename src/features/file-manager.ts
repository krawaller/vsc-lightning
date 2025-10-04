import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { playSoundIfPresent, playSound } from "../utils/sound-manager";
import { LightningTreeItem } from "../providers/lightning-data-provider";

export async function openFile(item: any) {
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
          "No workspace folder found to resolve relative path"
        );
        return;
      }
    }

    const uri = vscode.Uri.file(resolvedPath);

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
      const document = await vscode.window.showTextDocument(uri);

      // If a line number is specified, scroll to that line
      if (item.line !== undefined && item.line > 0) {
        const position = new vscode.Position(item.line - 1, 0); // VS Code uses 0-based line numbers
        const range = new vscode.Range(position, position);
        document.selection = new vscode.Selection(position, position);
        document.revealRange(range, vscode.TextEditorRevealType.InCenter);
      }

      // Apply highlighting if specified
      if (item.highlightStartLine !== undefined) {
        const startLine = Math.max(0, item.highlightStartLine - 1); // Convert to 0-based
        const endLine = item.highlightEndLine
          ? Math.max(0, item.highlightEndLine - 1)
          : startLine;

        const highlightRange = new vscode.Range(
          new vscode.Position(startLine, 0),
          new vscode.Position(endLine, Number.MAX_SAFE_INTEGER) // End of line
        );

        if (item.highlightType === "selection") {
          // Set selection to highlight the range
          document.selection = new vscode.Selection(
            highlightRange.start,
            highlightRange.end
          );
          document.revealRange(
            highlightRange,
            vscode.TextEditorRevealType.InCenter
          );
        } else {
          // Use text editor decorations for visual highlighting
          const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: item.highlightColor || "rgba(255, 255, 0, 0.3)", // Default yellow highlight
            border: "1px solid rgba(255, 255, 0, 0.8)",
            isWholeLine: true,
          });

          // Apply the decoration
          document.setDecorations(decorationType, [highlightRange]);

          // Remove decoration after specified duration (default 5 seconds)
          const duration =
            item.highlightDuration !== undefined
              ? item.highlightDuration
              : 5000;
          if (duration > 0) {
            setTimeout(() => {
              decorationType.dispose();
            }, duration);
          }
          // If duration is 0, decoration stays permanent until manually cleared
        }
      }
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open file: ${item.path}`);
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
            "No workspace folder found to resolve relative path"
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
        `File "${path.basename(filePath)}" is not currently open`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to close file: ${filePath}`);
    }
  }
}

export async function showDialog(item: any) {
  // Play sound if present
  await playSoundIfPresent(item);

  const severity = item.severity || "info";
  switch (severity) {
    case "error":
      vscode.window.showErrorMessage(item.message);
      break;
    case "warning":
      vscode.window.showWarningMessage(item.message);
      break;
    case "info":
    default:
      vscode.window.showInformationMessage(item.message);
      break;
  }
}

export async function applyDiff(item: any) {
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
          "No workspace folder found to resolve relative path"
        );
        return;
      }
    }

    // Check if the diff file exists
    try {
      await fs.promises.access(resolvedPath);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Diff file not found: ${path.basename(diffPath)}`
      );
      return;
    }

    // Get the workspace root for git commands
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage(
        "No workspace folder found for git operations"
      );
      return;
    }

    // Determine action - use provided action or show confirmation dialog
    let selectedAction = action;

    if (!selectedAction) {
      // Show confirmation dialog only if no action is specified
      const dialogResult = await vscode.window.showWarningMessage(
        `Apply diff from "${path.basename(
          diffPath
        )}"? This will modify your working directory.`,
        { modal: true },
        "Apply Diff",
        "Preview Only"
      );

      // Map dialog result to action
      if (dialogResult === "Apply Diff") {
        selectedAction = "apply";
      } else if (dialogResult === "Preview Only") {
        selectedAction = "preview";
      } else {
        // User cancelled
        return;
      }
    }

    if (selectedAction === "apply") {
      // Execute git apply command
      const { exec } = require("child_process");
      const workingDir = workspaceFolder.uri.fsPath;

      exec(
        `git apply "${resolvedPath}"`,
        { cwd: workingDir },
        (error: any, stdout: string, stderr: string) => {
          if (error) {
            vscode.window.showErrorMessage(
              `Failed to apply diff: ${error.message}\n${stderr}`
            );
          } else {
            vscode.window.showInformationMessage(
              `Successfully applied diff: ${path.basename(diffPath)}`
            );
            // Note: Removed file explorer refresh to avoid switching to Explorer tab
          }
        }
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
    const diffPath = treeItem.lightningItem.diffPath;

    try {
      let resolvedPath = diffPath;

      // If the path is relative, resolve it against the workspace root
      if (!path.isAbsolute(diffPath)) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
          resolvedPath = path.resolve(workspaceFolder.uri.fsPath, diffPath);
        } else {
          vscode.window.showErrorMessage(
            "No workspace folder found to resolve relative path"
          );
          return;
        }
      }

      // Check if the diff file exists
      try {
        await fs.promises.access(resolvedPath);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Diff file not found: ${path.basename(diffPath)}`
        );
        return;
      }

      // Get the workspace root for git commands
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage(
          "No workspace folder found for git operations"
        );
        return;
      }

      // Execute git apply --reverse command immediately
      const { exec } = require("child_process");
      const workingDir = workspaceFolder.uri.fsPath;

      exec(
        `git apply --reverse "${resolvedPath}"`,
        { cwd: workingDir },
        (error: any, stdout: string, stderr: string) => {
          if (error) {
            vscode.window.showErrorMessage(
              `Failed to revert diff: ${error.message}\n${stderr}`
            );
          } else {
            // Play revert sound on success
            if (
              treeItem.lightningItem &&
              treeItem.lightningItem.type === "diff" &&
              treeItem.lightningItem.revertSoundPath
            ) {
              playSound(treeItem.lightningItem.revertSoundPath);
            }
            vscode.window.showInformationMessage(
              `Successfully reverted diff: ${path.basename(diffPath)}`
            );
          }
        }
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to revert diff: ${diffPath}`);
    }
  }
}
