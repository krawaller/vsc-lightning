// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

class LightningViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "lightningView";

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "showHello":
            vscode.window.showInformationMessage("Hello from Lightning!");
            return;
        }
      },
      undefined,
      []
    );
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Lightning</title>
			<style>
				body {
					padding: 20px;
					font-family: var(--vscode-font-family);
					font-size: var(--vscode-font-size);
					color: var(--vscode-foreground);
				}
				.hello-button {
					background-color: var(--vscode-button-background);
					color: var(--vscode-button-foreground);
					border: none;
					padding: 10px 20px;
					cursor: pointer;
					border-radius: 4px;
					font-size: 14px;
					width: 100%;
				}
				.hello-button:hover {
					background-color: var(--vscode-button-hoverBackground);
				}
			</style>
		</head>
		<body>
			<h3>Lightning Extension</h3>
			<p>Click the button below to show a hello dialog:</p>
			<button class="hello-button" onclick="showHello()">Say Hello</button>
			
			<script>
				const vscode = acquireVsCodeApi();
				
				function showHello() {
					vscode.postMessage({
						command: 'showHello'
					});
				}
			</script>
		</body>
		</html>`;
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "lightning" is now active!');

  // Register the webview view provider
  const provider = new LightningViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      LightningViewProvider.viewType,
      provider
    )
  );

  // Register the command for the hello dialog
  const disposable = vscode.commands.registerCommand(
    "lightning.showHello",
    () => {
      vscode.window.showInformationMessage("Hello from Lightning!");
    }
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
