// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { LightningConfiguration, LightningItem } from "./lightning-types";

class LightningTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly command?: vscode.Command,
    public readonly lightningItem?: LightningItem
  ) {
    // Set collapsible state based on item type
    const collapsibleState =
      lightningItem?.type === "folder"
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;

    super(label, collapsibleState);
    this.tooltip = this.label;
    this.command = command;

    // Set appropriate icons and context values based on item type
    if (lightningItem) {
      if (lightningItem.type === "file") {
        this.iconPath = new vscode.ThemeIcon("file");
        this.contextValue = "fileItem";
      } else if (lightningItem.type === "dialog") {
        this.iconPath = new vscode.ThemeIcon("comment-discussion");
        this.contextValue = "dialogItem";
      } else if (lightningItem.type === "folder") {
        this.iconPath = new vscode.ThemeIcon("folder");
        this.contextValue = "folderItem";
      }
    }
  }
}

class LightningDataProvider
  implements vscode.TreeDataProvider<LightningTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    LightningTreeItem | undefined | null | void
  > = new vscode.EventEmitter<LightningTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    LightningTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private configuration: LightningConfiguration | undefined;
  private treeView: vscode.TreeView<LightningTreeItem> | undefined;

  setTreeView(treeView: vscode.TreeView<LightningTreeItem>): void {
    this.treeView = treeView;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async setConfigurationFile(filePath: string): Promise<void> {
    try {
      const fileContent = await fs.promises.readFile(filePath, "utf8");
      const config: LightningConfiguration = JSON.parse(fileContent);

      this.configuration = config;

      // Update the tree view title
      if (this.treeView) {
        this.treeView.title = config.title;
      }

      this.refresh();
    } catch (error) {
      console.error("Error loading configuration file:", error);
      vscode.window.showErrorMessage(
        `Failed to load configuration file: ${error}`
      );
    }
  }

  getTreeItem(element: LightningTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: LightningTreeItem): Thenable<LightningTreeItem[]> {
    if (!element) {
      // Root items
      if (!this.configuration) {
        // Show "Open JSON file" button when no configuration is loaded
        return Promise.resolve([
          new LightningTreeItem("Open JSON file", {
            command: "lightning.openJsonFile",
            title: "Open JSON file",
            arguments: [],
          }),
        ]);
      } else {
        // Show items from the configuration
        return Promise.resolve(this.getConfigurationItems());
      }
    } else {
      // Handle folder expansion - show items of the folder
      if (element.lightningItem?.type === "folder") {
        return Promise.resolve(this.getChildItems(element.lightningItem.items));
      }
      return Promise.resolve([]);
    }
  }

  private getConfigurationItems(): LightningTreeItem[] {
    if (!this.configuration) {
      return [];
    }

    return this.getChildItems(this.configuration.items);
  }

  private getChildItems(items: LightningItem[]): LightningTreeItem[] {
    return items.map((item) => {
      let command: vscode.Command | undefined;

      if (item.type === "file") {
        command = {
          command: "lightning.openFile",
          title: "Open File",
          arguments: [item.path, item.line],
        };
      } else if (item.type === "dialog") {
        command = {
          command: "lightning.showDialog",
          title: "Show Dialog",
          arguments: [item.message, item.severity || "info"],
        };
      }
      // Note: folder items don't need commands as they're handled by expansion

      return new LightningTreeItem(item.label, command, item);
    });
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("Lightning extension is now active!");

  // Register the tree data provider
  const treeDataProvider = new LightningDataProvider();
  const treeView = vscode.window.createTreeView("lightningView", {
    treeDataProvider: treeDataProvider,
  });

  // Allow the data provider to update the tree view title
  treeDataProvider.setTreeView(treeView);

  // Register the command to open JSON file
  const openJsonFileCommand = vscode.commands.registerCommand(
    "lightning.openJsonFile",
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

  // Register the command to open files
  const openFileCommand = vscode.commands.registerCommand(
    "lightning.openFile",
    async (filePath: string, lineNumber?: number) => {
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
          if (lineNumber !== undefined && lineNumber > 0) {
            const position = new vscode.Position(lineNumber - 1, 0); // VS Code uses 0-based line numbers
            const range = new vscode.Range(position, position);
            document.selection = new vscode.Selection(position, position);
            document.revealRange(range, vscode.TextEditorRevealType.InCenter);
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
      }
    }
  );

  // Register the command to show dialog
  const showDialogCommand = vscode.commands.registerCommand(
    "lightning.showDialog",
    (message: string, severity: "info" | "warning" | "error") => {
      switch (severity) {
        case "error":
          vscode.window.showErrorMessage(message);
          break;
        case "warning":
          vscode.window.showWarningMessage(message);
          break;
        case "info":
        default:
          vscode.window.showInformationMessage(message);
          break;
      }
    }
  );

  // Register the command to close file tabs
  const closeFileCommand = vscode.commands.registerCommand(
    "lightning.closeFile",
    async (treeItem: LightningTreeItem) => {
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
  );

  context.subscriptions.push(
    openJsonFileCommand,
    openFileCommand,
    showDialogCommand,
    closeFileCommand
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
