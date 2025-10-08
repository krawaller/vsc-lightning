import * as vscode from "vscode";
import * as path from "path";
import {
  LightningDataProvider,
  LightningTreeItem,
} from "../providers/lightning-data-provider";
import {
  LightningQuiz,
  LightningBrowser,
  LightningItem,
  LightningFileLink,
  LightningDialogMessage,
  LightningDiff,
} from "../lightning-types";
import { setSoundMuted, playSoundIfPresent } from "../utils/sound-manager";
import {
  showQuizDialog,
  showQuizMenu,
  showQuizWebview,
} from "../features/quiz-manager";
import { openBrowser } from "../features/browser-manager";
import {
  openFile,
  closeFile,
  applyDiff,
  revertDiff,
} from "../features/file-manager";
import { showDialog } from "../features/dialog-manager";

export function registerCommands(
  context: vscode.ExtensionContext,
  treeDataProvider: LightningDataProvider
): void {
  // Register the command to reset config
  const resetConfigCommand = vscode.commands.registerCommand(
    "lightning.resetConfig",
    () => {
      // Reset to initial state
      treeDataProvider.resetToInitialState();
    }
  );

  // Register the command to open configuration
  const openConfigurationCommand = vscode.commands.registerCommand(
    "lightning.openConfiguration",
    async () => {
      const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: "Select Lightning JSON File",
        filters: {
          "JSON files": ["json"],
        },
      });

      if (fileUri && fileUri[0]) {
        const filePath = fileUri[0].fsPath;
        await treeDataProvider.setConfigurationFile(filePath);
        vscode.window.showInformationMessage(
          `Loaded configuration: ${path.basename(filePath)}`
        );
      }
    }
  );

  // Register the command to mute sounds
  const toggleMuteCommand = vscode.commands.registerCommand(
    "lightning.toggleMute",
    () => {
      setSoundMuted(true);
      vscode.window.showInformationMessage("Lightning sounds muted");
    }
  );

  // Register the command to unmute sounds
  const toggleUnmuteCommand = vscode.commands.registerCommand(
    "lightning.toggleUnmute",
    () => {
      setSoundMuted(false);
      vscode.window.showInformationMessage("Lightning sounds unmuted");
    }
  );

  // Register the command to show quiz
  const showQuizCommand = vscode.commands.registerCommand(
    "lightning.showQuiz",
    async (quizItem: LightningQuiz) => {
      if (quizItem && quizItem.type === "quiz") {
        // Play sound if present
        await playSoundIfPresent(quizItem);

        // Check display mode - default to webview if not specified
        const displayMode = quizItem.displayMode || "webview";

        if (displayMode === "menu") {
          await showQuizMenu(quizItem);
        } else if (displayMode === "dialog") {
          await showQuizDialog(quizItem);
        } else {
          await showQuizWebview(quizItem);
        }
      }
    }
  );

  // Register the command to open browser
  const openBrowserCommand = vscode.commands.registerCommand(
    "lightning.openBrowser",
    async (browserItem: LightningBrowser) => {
      await openBrowser(browserItem);
    }
  );

  // Register the command to play sound
  const playSoundCommand = vscode.commands.registerCommand(
    "lightning.playSound",
    async (item: LightningItem) => {
      await playSoundIfPresent(item);
    }
  );

  // Register the command to open files
  const openFileCommand = vscode.commands.registerCommand(
    "lightning.openFile",
    async (item: LightningFileLink) => {
      await openFile(item);
    }
  );

  // Register the command to show dialog
  const showDialogCommand = vscode.commands.registerCommand(
    "lightning.showDialog",
    async (item: LightningDialogMessage) => {
      await showDialog(item);
    }
  );

  // Register the command to close file tabs
  const closeFileCommand = vscode.commands.registerCommand(
    "lightning.closeFile",
    async (treeItem: LightningTreeItem) => {
      await closeFile(treeItem);
    }
  );

  // Register the command to zoom file (close other tabs and focus on target file)
  const zoomFileCommand = vscode.commands.registerCommand(
    "lightning.zoomFile",
    async (treeItem: LightningTreeItem) => {
      // First, close all open tabs
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");

      // Then, open the file if it's a file item
      if (treeItem.lightningItem?.type === "file") {
        await openFile(treeItem.lightningItem as LightningFileLink);
      }
    }
  );

  // Register the command to apply diff files
  const applyDiffCommand = vscode.commands.registerCommand(
    "lightning.applyDiff",
    async (item: LightningDiff) => {
      await applyDiff(item);
    }
  );

  // Register the command to revert diff files
  const revertDiffCommand = vscode.commands.registerCommand(
    "lightning.revertDiff",
    async (treeItem: LightningTreeItem) => {
      await revertDiff(treeItem);
    }
  );

  // Add all commands to the context subscriptions
  context.subscriptions.push(
    resetConfigCommand,
    openConfigurationCommand,
    toggleMuteCommand,
    toggleUnmuteCommand,
    openFileCommand,
    showDialogCommand,
    showQuizCommand,
    openBrowserCommand,
    playSoundCommand,
    closeFileCommand,
    zoomFileCommand,
    applyDiffCommand,
    revertDiffCommand
  );
}
