// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

class LightningTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly command?: vscode.Command
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = this.label;
    this.command = command;
  }
}

class LightningDataProvider
  implements vscode.TreeDataProvider<LightningTreeItem>
{
  getTreeItem(element: LightningTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: LightningTreeItem): Thenable<LightningTreeItem[]> {
    if (!element) {
      // Root items
      return Promise.resolve([
        new LightningTreeItem("Say Hello", {
          command: "lightning.showHello",
          title: "Say Hello",
          arguments: [],
        }),
      ]);
    }
    return Promise.resolve([]);
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("Lightning extension is now active!");

  // Register the tree data provider
  const treeDataProvider = new LightningDataProvider();
  vscode.window.createTreeView("lightningView", {
    treeDataProvider: treeDataProvider,
  });

  // Register the command for the hello dialog
  const helloCommand = vscode.commands.registerCommand(
    "lightning.showHello",
    () => {
      vscode.window.showInformationMessage("Hello from Lightning!");
    }
  );

  context.subscriptions.push(helloCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
