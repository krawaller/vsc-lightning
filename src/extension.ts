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
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = this.label;
    this.command = command;

    // Set appropriate icons based on item type
    if (lightningItem) {
      if (lightningItem.type === "file") {
        this.iconPath = new vscode.ThemeIcon("file");
      } else if (lightningItem.type === "dialog") {
        this.iconPath = new vscode.ThemeIcon("comment-discussion");
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
    }
    return Promise.resolve([]);
  }

  private getConfigurationItems(): LightningTreeItem[] {
    if (!this.configuration) {
      return [];
    }

    return this.configuration.items.map((item) => {
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

  context.subscriptions.push(
    openJsonFileCommand,
    openFileCommand,
    showDialogCommand
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
