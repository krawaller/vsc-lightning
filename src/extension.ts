// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

class LightningTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly command?: vscode.Command,
    public readonly filePath?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = this.label;
    this.command = command;

    // Add file icon for file items
    if (filePath) {
      this.resourceUri = vscode.Uri.file(filePath);
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

  private selectedFolder: string | undefined;
  private treeView: vscode.TreeView<LightningTreeItem> | undefined;

  setTreeView(treeView: vscode.TreeView<LightningTreeItem>): void {
    this.treeView = treeView;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setFolder(folderPath: string): void {
    this.selectedFolder = folderPath;
    if (this.treeView) {
      this.treeView.title = path.basename(folderPath);
    }
    this.refresh();
  }

  getTreeItem(element: LightningTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: LightningTreeItem): Thenable<LightningTreeItem[]> {
    if (!element) {
      // Root items
      if (!this.selectedFolder) {
        // Show "Open folder" button when no folder is selected
        return Promise.resolve([
          new LightningTreeItem("Open folder", {
            command: "lightning.openFolder",
            title: "Open folder",
            arguments: [],
          }),
        ]);
      } else {
        // Show files in the selected folder
        return this.getFilesInFolder(this.selectedFolder);
      }
    }
    return Promise.resolve([]);
  }

  private async getFilesInFolder(
    folderPath: string
  ): Promise<LightningTreeItem[]> {
    try {
      const files = await fs.promises.readdir(folderPath);
      const fileItems: LightningTreeItem[] = [];

      for (const file of files) {
        const fullPath = path.join(folderPath, file);
        const stat = await fs.promises.stat(fullPath);

        // Only show files (not directories for now)
        if (stat.isFile()) {
          fileItems.push(new LightningTreeItem(file, undefined, fullPath));
        }
      }

      return fileItems.sort((a, b) => a.label.localeCompare(b.label));
    } catch (error) {
      console.error("Error reading folder:", error);
      return [new LightningTreeItem("Error reading folder", undefined)];
    }
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

  // Register the command to open folder
  const openFolderCommand = vscode.commands.registerCommand(
    "lightning.openFolder",
    async () => {
      const folderUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select Folder",
      });

      if (folderUri && folderUri[0]) {
        const folderPath = folderUri[0].fsPath;
        treeDataProvider.setFolder(folderPath);
        vscode.window.showInformationMessage(
          `Selected folder: ${path.basename(folderPath)}`
        );
      }
    }
  );

  // Register the command for the hello dialog (keeping for backwards compatibility)
  const helloCommand = vscode.commands.registerCommand(
    "lightning.showHello",
    () => {
      vscode.window.showInformationMessage("Hello from Lightning!");
    }
  );

  context.subscriptions.push(openFolderCommand, helloCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
