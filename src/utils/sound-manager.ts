import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { LightningItem } from "../lightning-types";

// Global state for sound muting
let isSoundMuted = false;

export function setSoundMuted(muted: boolean) {
  isSoundMuted = muted;
  // Update VS Code context for menu display
  vscode.commands.executeCommand("setContext", "lightning.soundsMuted", muted);
}

export function getSoundMuted(): boolean {
  return isSoundMuted;
}

// Helper function to play sound if soundPath exists on an item
export async function playSoundIfPresent(item: LightningItem) {
  if (item && item.soundPath) {
    await playSound(item.soundPath);
  }
}

// Function to play sound files
export async function playSound(soundPath: string) {
  // Check if sounds are muted
  if (getSoundMuted()) {
    return; // Exit early if muted
  }

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
      }
      // Sound plays silently without notification
    });
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error playing sound: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
