// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import {
  LightningDataProvider,
  LightningDecorationProvider,
} from "./providers/lightning-data-provider";
import { playSoundIfPresent } from "./utils/sound-manager";
import { registerCommands } from "./commands/command-registry";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("Lightning extension is now active!");

  // Initialize the mute context and config loaded context
  vscode.commands.executeCommand("setContext", "lightning.soundsMuted", false);
  vscode.commands.executeCommand("setContext", "lightning.configLoaded", false);

  // Register the file decoration provider for custom label colors
  const decorationProvider = new LightningDecorationProvider();
  vscode.window.registerFileDecorationProvider(decorationProvider);

  // Register the tree data provider
  const treeDataProvider = new LightningDataProvider(decorationProvider);
  const treeView = vscode.window.createTreeView("lightningView", {
    treeDataProvider: treeDataProvider,
  });

  // Allow the data provider to update the tree view title
  treeDataProvider.setTreeView(treeView);

  // Handle tree view expand/collapse to play sounds for folders
  treeView.onDidExpandElement((e) => {
    if (e.element.lightningItem && e.element.lightningItem.type === "folder") {
      playSoundIfPresent(e.element.lightningItem);
    }
  });

  treeView.onDidCollapseElement((e) => {
    if (e.element.lightningItem && e.element.lightningItem.type === "folder") {
      playSoundIfPresent(e.element.lightningItem);
    }
  });

  // Register all commands
  registerCommands(context, treeDataProvider);
}

// This method is called when your extension is deactivated
export function deactivate() {}
