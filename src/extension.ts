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
      // Use custom icon if provided, otherwise fall back to type-specific defaults
      let iconName: string;

      if (lightningItem.icon) {
        iconName = lightningItem.icon;
      } else {
        // Type-specific default icons
        if (lightningItem.type === "title") {
          iconName = "symbol-event";
        } else if (lightningItem.type === "file") {
          iconName = "file";
        } else if (lightningItem.type === "dialog") {
          iconName = "comment-discussion";
        } else if (lightningItem.type === "folder") {
          iconName = "folder";
        } else if (lightningItem.type === "diff") {
          iconName = "git-pull-request";
        } else if (lightningItem.type === "quiz") {
          iconName = "question";
        } else {
          iconName = "circle-outline"; // fallback icon
        }
      }

      // Create icon with optional color
      if (lightningItem.iconColor) {
        this.iconPath = new vscode.ThemeIcon(
          iconName,
          new vscode.ThemeColor(lightningItem.iconColor)
        );
      } else {
        this.iconPath = new vscode.ThemeIcon(iconName);
      }

      // Set custom label color if provided
      if (lightningItem.labelColor) {
        this.resourceUri = vscode.Uri.parse(
          `lightning://label-color/${lightningItem.labelColor}`
        );
      } // Set context values for different item types
      if (lightningItem.type === "title") {
        this.contextValue = "titleItem";
      } else if (lightningItem.type === "file") {
        this.contextValue = "fileItem";
      } else if (lightningItem.type === "dialog") {
        this.contextValue = "dialogItem";
      } else if (lightningItem.type === "folder") {
        this.contextValue = "folderItem";
      } else if (lightningItem.type === "diff") {
        this.contextValue = "lightning-diff";
      } else if (lightningItem.type === "quiz") {
        this.contextValue = "lightning-quiz";
      }
    }
  }
}

class LightningDecorationProvider implements vscode.FileDecorationProvider {
  onDidChangeFileDecorations?: vscode.Event<
    undefined | vscode.Uri | vscode.Uri[]
  >;

  provideFileDecoration(
    uri: vscode.Uri,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FileDecoration> {
    if (uri.scheme === "lightning" && uri.authority === "label-color") {
      const colorName = uri.path.substring(1); // Remove leading slash
      return {
        color: new vscode.ThemeColor(colorName),
      };
    }
    return undefined;
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

  resetToInitialState(): void {
    this.configuration = undefined;
    this.refresh();
  }

  async setConfigurationFile(filePath: string): Promise<void> {
    try {
      const fileContent = await fs.promises.readFile(filePath, "utf8");
      const config: LightningConfiguration = JSON.parse(fileContent);

      this.configuration = config;

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
        // Show "Open configuration" button when no configuration is loaded
        return Promise.resolve([
          new LightningTreeItem("Open configuration", {
            command: "lightning.openJsonFile",
            title: "Open configuration",
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

      if (item.type === "title") {
        // Title items get a generic sound command if they have soundPath
        if (item.soundPath) {
          command = {
            command: "lightning.playSound",
            title: "Play Sound",
            arguments: [item],
          };
        }
      } else if (item.type === "file") {
        command = {
          command: "lightning.openFile",
          title: "Open File",
          arguments: [item],
        };
      } else if (item.type === "dialog") {
        command = {
          command: "lightning.showDialog",
          title: "Show Dialog",
          arguments: [item],
        };
      } else if (item.type === "diff") {
        command = {
          command: "lightning.applyDiff",
          title: "Apply Diff",
          arguments: [item], // Pass full item instead of individual properties
        };
      } else if (item.type === "quiz") {
        command = {
          command: "lightning.showQuiz",
          title: "Show Quiz",
          arguments: [item],
        };
      }
      // Note: folder items don't need commands as they're handled by expansion

      return new LightningTreeItem(item.label, command, item);
    });
  }
}

// Function to show quiz in actual modal dialogs
async function showQuizDialog(quizItem: any) {
  // Combine and randomize answers
  const allAnswers = [
    ...quizItem.correctAnswers.map((answer: string) => ({
      text: answer,
      correct: true,
    })),
    ...quizItem.wrongAnswers.map((answer: string) => ({
      text: answer,
      correct: false,
    })),
  ];

  // Shuffle the answers
  for (let i = allAnswers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]];
  }

  // Use a simple approach with showInformationMessage and hope for the best alignment
  const questionAndAnswers =
    `${quizItem.question}\n\n` +
    allAnswers
      .map((answer, index) => `${index + 1}. ${answer.text}`)
      .join("\n");

  // Show initial dialog
  const action = await vscode.window.showInformationMessage(
    questionAndAnswers,
    { modal: true },
    "Reveal Answers"
  );

  if (action === "Reveal Answers") {
    // Show revealed answers
    const revealedContent =
      `${quizItem.question}\n\n` +
      allAnswers
        .map((answer, index) => {
          const icon = answer.correct ? "✅" : "❌";
          return `${icon} ${index + 1}. ${answer.text}`;
        })
        .join("\n");

    await vscode.window.showInformationMessage(revealedContent, {
      modal: true,
    });
  }
}

// Function to show quiz in menu format (QuickPick)
async function showQuizMenu(quizItem: any) {
  // Combine and randomize answers
  const allAnswers = [
    ...quizItem.correctAnswers.map((answer: string) => ({
      text: answer,
      correct: true,
    })),
    ...quizItem.wrongAnswers.map((answer: string) => ({
      text: answer,
      correct: false,
    })),
  ];

  // Shuffle the answers
  for (let i = allAnswers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]];
  }

  // Create the quiz content for the dialog
  const questionText =
    `${quizItem.question}\n\n` +
    allAnswers
      .map((answer, index) => `${index + 1}. ${answer.text}`)
      .join("\n");

  // Show initial dialog with question and answers using QuickPick for better text alignment
  const quickPick = vscode.window.createQuickPick();
  quickPick.title = quizItem.question;
  quickPick.placeholder = "Select 'Reveal Answers' to see the correct answers";
  quickPick.items = [
    ...allAnswers.map((answer, index) => ({
      label: `${index + 1}. ${answer.text}`,
      detail: "", // We'll update this after reveal
    })),
    { label: "$(eye) Reveal Answers", detail: "Click to show correct answers" },
  ];
  quickPick.canSelectMany = false;

  quickPick.onDidAccept(() => {
    const selected = quickPick.selectedItems[0];
    if (selected && selected.label.includes("Reveal Answers")) {
      quickPick.hide();
      // Show revealed answers in a new QuickPick
      showRevealedAnswers(quizItem.question, allAnswers);
    }
  });

  quickPick.show();
}

// Function to show revealed answers with correct/incorrect indicators
function showRevealedAnswers(question: string, allAnswers: any[]) {
  const revealQuickPick = vscode.window.createQuickPick();
  revealQuickPick.title = question;
  revealQuickPick.placeholder = "Quiz Results - Press Escape to close";
  revealQuickPick.items = allAnswers.map((answer, index) => {
    const icon = answer.correct ? "$(check)" : "$(x)";
    return {
      label: `${icon} ${index + 1}. ${answer.text}`,
      detail: "",
    };
  });
  revealQuickPick.canSelectMany = false;
  revealQuickPick.show();
}

// Function to show quiz dialog with randomized answers
async function showQuizWebview(quizItem: any) {
  // Combine and randomize answers
  const allAnswers = [
    ...quizItem.correctAnswers.map((answer: string) => ({
      text: answer,
      correct: true,
    })),
    ...quizItem.wrongAnswers.map((answer: string) => ({
      text: answer,
      correct: false,
    })),
  ];

  // Shuffle the answers
  for (let i = allAnswers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]];
  }

  // Create the quiz panel
  const panel = vscode.window.createWebviewPanel(
    "lightningQuiz",
    `Quiz: ${quizItem.label}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // Set the webview content
  panel.webview.html = getQuizWebviewContent(quizItem.question, allAnswers);

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    (message) => {
      switch (message.command) {
        case "reveal":
          panel.webview.postMessage({
            command: "showAnswers",
            answers: allAnswers,
          });
          return;
      }
    },
    undefined,
    []
  );
}

// Function to generate the webview HTML content
function getQuizWebviewContent(question: string, answers: any[]): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lightning Quiz</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
        }
        .question {
            font-size: 1.2em;
            font-weight: bold;
            margin-bottom: 20px;
            color: var(--vscode-textLink-foreground);
        }
        .answers {
            list-style: none;
            padding: 0;
        }
        .answer {
            padding: 10px;
            margin: 5px 0;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 5px;
            border-left: 3px solid var(--vscode-textBlockQuote-border);
        }
        .answer.correct {
            border-left-color: var(--vscode-gitDecoration-addedResourceForeground);
        }
        .answer.incorrect {
            border-left-color: var(--vscode-gitDecoration-deletedResourceForeground);
        }
        .reveal-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 1em;
            margin-top: 20px;
        }
        .reveal-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .icon {
            margin-right: 8px;
            font-weight: bold;
        }
        .correct-icon {
            color: var(--vscode-gitDecoration-addedResourceForeground);
        }
        .incorrect-icon {
            color: var(--vscode-gitDecoration-deletedResourceForeground);
        }
        .hidden {
            display: none;
        }
    </style>
</head>
<body>
    <div class="question">${question}</div>
    <ul class="answers">
        ${answers
          .map(
            (answer, index) =>
              `<li class="answer" id="answer-${index}">
             <span class="icon hidden" id="icon-${index}"></span>
             <span class="text">${answer.text}</span>
           </li>`
          )
          .join("")}
    </ul>
    <button class="reveal-btn" onclick="revealAnswers()">Reveal</button>

    <script>
        const vscode = acquireVsCodeApi();
        
        function revealAnswers() {
            vscode.postMessage({
                command: 'reveal'
            });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            
            if (message.command === 'showAnswers') {
                message.answers.forEach((answer, index) => {
                    const answerElement = document.getElementById('answer-' + index);
                    const iconElement = document.getElementById('icon-' + index);
                    
                    if (answer.correct) {
                        answerElement.classList.add('correct');
                        iconElement.textContent = '✓';
                        iconElement.classList.add('correct-icon');
                    } else {
                        answerElement.classList.add('incorrect');
                        iconElement.textContent = '✗';
                        iconElement.classList.add('incorrect-icon');
                    }
                    
                    iconElement.classList.remove('hidden');
                });
                
                document.querySelector('.reveal-btn').style.display = 'none';
            }
        });
    </script>
</body>
</html>`;
}

// Helper function to play sound if soundPath exists on an item
async function playSoundIfPresent(item: any) {
  if (item && item.soundPath) {
    await playSound(item.soundPath);
  }
}

// Function to play sound files
async function playSound(soundPath: string) {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace folder found");
      return;
    }

    const workspaceFolder = workspaceFolders[0];
    const resolvedPath = path.resolve(workspaceFolder.uri.fsPath, soundPath);

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      vscode.window.showErrorMessage(`Sound file not found: ${soundPath}`);
      return;
    }

    // Use child_process to play the sound file
    const { exec } = require("child_process");

    // Determine the command based on the operating system
    let command: string;
    const platform = process.platform;

    if (platform === "darwin") {
      // macOS
      command = `afplay "${resolvedPath}"`;
    } else if (platform === "win32") {
      // Windows
      command = `powershell -c (New-Object Media.SoundPlayer "${resolvedPath}").PlaySync()`;
    } else {
      // Linux and others
      command = `aplay "${resolvedPath}" 2>/dev/null || paplay "${resolvedPath}" 2>/dev/null || ffplay -nodisp -autoexit "${resolvedPath}" 2>/dev/null`;
    }

    exec(command, (error: any, stdout: string, stderr: string) => {
      if (error) {
        vscode.window.showErrorMessage(
          `Failed to play sound: ${error.message}`
        );
      } else {
        vscode.window.showInformationMessage(
          `Playing: ${path.basename(soundPath)}`
        );
      }
    });
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error playing sound: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("Lightning extension is now active!");

  // Register the file decoration provider for custom label colors
  const decorationProvider = new LightningDecorationProvider();
  vscode.window.registerFileDecorationProvider(decorationProvider);

  // Register the tree data provider
  const treeDataProvider = new LightningDataProvider();
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

  // Register the command to reset config
  const resetConfigCommand = vscode.commands.registerCommand(
    "lightning.resetConfig",
    () => {
      // Reset to initial state
      treeDataProvider.resetToInitialState();
    }
  );

  // Register the command to show quiz
  const showQuizCommand = vscode.commands.registerCommand(
    "lightning.showQuiz",
    async (quizItem: any) => {
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

  // Register the command to play sound
  const playSoundCommand = vscode.commands.registerCommand(
    "lightning.playSound",
    async (item: any) => {
      await playSoundIfPresent(item);
    }
  );

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
    async (item: any) => {
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
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open file: ${item.path}`);
      }
    }
  );

  // Register the command to show dialog
  const showDialogCommand = vscode.commands.registerCommand(
    "lightning.showDialog",
    async (item: any) => {
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
  );

  // Register the command to apply diff files
  const applyDiffCommand = vscode.commands.registerCommand(
    "lightning.applyDiff",
    async (item: any) => {
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
  );

  // Register the command to revert diff files
  const revertDiffCommand = vscode.commands.registerCommand(
    "lightning.revertDiff",
    async (treeItem: LightningTreeItem) => {
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
  );

  context.subscriptions.push(
    resetConfigCommand,
    openJsonFileCommand,
    openFileCommand,
    showDialogCommand,
    showQuizCommand,
    playSoundCommand,
    closeFileCommand,
    applyDiffCommand,
    revertDiffCommand
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
