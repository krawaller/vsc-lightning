import * as vscode from "vscode";
import { playSoundIfPresent } from "../utils/sound-manager";
import { LightningBrowser } from "../lightning-types";

export async function openBrowser(browserItem: LightningBrowser) {
  if (browserItem && browserItem.type === "browser") {
    // Play sound if present
    await playSoundIfPresent(browserItem);

    const browserType = browserItem.browserType || "simple";
    const url = browserItem.url;
    const title = browserItem.title || browserItem.label;

    try {
      if (browserType === "external") {
        // Open in external browser
        await vscode.env.openExternal(vscode.Uri.parse(url));
        vscode.window.showInformationMessage(
          `Opened ${title} in external browser`
        );
      } else {
        // Open in VS Code's simple browser - create a proper embedded browser
        const panel = vscode.window.createWebviewPanel(
          "lightning-browser",
          title,
          vscode.ViewColumn.Active,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
          }
        );

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
          async (message) => {
            switch (message.command) {
              case "openExternal":
                await vscode.env.openExternal(vscode.Uri.parse(message.url));
                break;
            }
          },
          undefined,
          []
        );

        // Create a simple browser interface that stays in VS Code
        panel.webview.html = getBrowserWebviewContent(url, title);

        vscode.window.showInformationMessage(
          `Opened ${title} in simple browser (embedded in VS Code)`
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to open browser: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

function getBrowserWebviewContent(url: string, title: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            body, html {
                margin: 0;
                padding: 0;
                height: 100vh;
                font-family: var(--vscode-font-family);
                background-color: var(--vscode-editor-background);
                color: var(--vscode-foreground);
                display: flex;
                flex-direction: column;
            }
            .browser-header {
                background-color: var(--vscode-titleBar-activeBackground);
                padding: 8px 12px;
                border-bottom: 1px solid var(--vscode-panel-border);
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .url-bar {
                flex: 1;
                background-color: var(--vscode-input-background);
                border: 1px solid var(--vscode-input-border);
                border-radius: 2px;
                padding: 4px 8px;
                color: var(--vscode-input-foreground);
                font-size: 13px;
            }
            .browser-content {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
            }
            .message {
                text-align: center;
                margin: 40px 0;
            }
            .url-link {
                color: var(--vscode-textLink-foreground);
                text-decoration: none;
                font-size: 16px;
                word-break: break-all;
            }
            .url-link:hover {
                text-decoration: underline;
            }
            .action-buttons {
                margin: 20px 0;
                text-align: center;
            }
            .action-button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px 16px;
                border-radius: 2px;
                cursor: pointer;
                font-size: 13px;
                margin: 0 5px;
            }
            .action-button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            .secondary-button {
                background-color: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
            }
            .secondary-button:hover {
                background-color: var(--vscode-button-secondaryHoverBackground);
            }
            .info-text {
                font-size: 13px;
                color: var(--vscode-descriptionForeground);
                margin: 20px 0;
            }
        </style>
    </head>
    <body>
        <div class="browser-header">
            <span>🌐</span>
            <input type="text" class="url-bar" value="${url}" readonly>
        </div>
        <div class="browser-content">
            <div class="message">
                <h2>${title}</h2>
                <p>Lightning Simple Browser</p>
                <div style="margin: 20px 0;">
                    <a href="${url}" class="url-link">${url}</a>
                </div>
                <div class="action-buttons">
                    <button class="action-button" onclick="openExternal()">
                        Open in External Browser
                    </button>
                </div>
                <div class="info-text">
                    <p><strong>Simple Browser Mode:</strong> This page stays within VS Code for your presentation workflow.</p>
                    <p>Due to web security policies, external websites cannot be embedded directly. Click the URL above or use the button below to open in your system browser.</p>
                </div>
            </div>
        </div>
        <script>
            const vscode = acquireVsCodeApi();
            
            function openExternal() {
                // Send message to the extension to open in external browser
                vscode.postMessage({
                    command: 'openExternal',
                    url: '${url}'
                });
            }
        </script>
    </body>
    </html>
  `;
}
