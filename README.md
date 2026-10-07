# Lightning

Lightning is a VS Code extension for running presentation flows inside the editor. It adds a Lightning activity-bar view that can load a JSON presentation config and turn it into clickable items for opening files, jumping to lines, highlighting code, showing dialogs, opening browser links, running quizzes, and applying diffs.

## Try it locally

1. Install dependencies:

   ```sh
   npm install
   ```

2. Build the extension:

   ```sh
   npm run compile
   ```

3. Press `F5` in VS Code and choose `Run Extension` if prompted. This opens a new Extension Development Host window with Lightning loaded and the `lightning-dev.code-workspace` workspace open.

4. Click the Lightning icon in the activity bar.

5. Click the `Open Configuration` action in the Lightning view title bar and select `sample-config.json` from the workspace root.

6. Click through the items in the Lightning view:
   - File items open files and can jump to or highlight specific lines.
   - Dialog items show VS Code information, warning, or error messages.
   - Browser items open a webview or the external browser.
   - Quiz items show quiz prompts.
   - Folder items group presentation sections.

After changing extension code, either restart the debug session or run the `watch` task and reload the Extension Development Host window.

## Useful commands

```sh
npm run compile      # typecheck, lint, and bundle to dist/
npm run watch        # watch TypeScript and esbuild output
npm run lint         # run ESLint over src/
npm run check-types  # run TypeScript without emitting files
npm test             # run the VS Code test runner
```

## Presentation config

Use `sample-config.json` as the reference config. A config has a title and an `items` array. Supported item types are defined in `src/lightning-types.ts`:

- `title`
- `file`
- `folder`
- `dialog`
- `browser`
- `quiz`
- `diff`

Relative file paths are resolved from the workspace root opened in the Extension Development Host window. File items open in the editor by default; set `openMode` to `"browser"` to open a local HTML file in VS Code's Simple Browser instead of showing its source.

Use the optional top-level `fileMenus` array to define Lightning editor-toolbar actions by file path. When a configured file is active, the `Lightning` editor button can apply or revert configured patch diffs, open configured git refs, compare the file between two configured git refs, or return to the worktree file no matter how the file was opened. Existing `diffButtons`, `refButtons`, and `compareButtons` on `file` items are still supported. Opening a normal `type: "file"` item with `refButtons` opens its first configured ref by default; clicking the same file item again cycles through the remaining refs and then `HEAD`.

Both normal `type: "file"` items and `fileMenus` entries can include `line` to jump to a specific line when opened. Use the Lightning panel title menu to show or hide a generated `Files` section for configured files; that generated file list is hidden by default and is populated from both `fileMenus` and normal file items. When the active editor matches a configured file with `refButtons`, the Lightning panel also shows `HEAD` plus that file's refs under a divider, with an arrow icon marking the active ref. A `refButton` can declare `pointsOfInterest`, each with a `title`, one-based `startLine`, optional `startColumn`, `endLine`, `endColumn`, and `icon`; when that ref is active, the points appear below the refs and select/reveal their target range when clicked. Single-tab mode is enabled by default and closes previous editor tabs before Lightning opens a new file, snapshot, or compare view; it can be toggled from the Lightning panel title menu.

## Notes

The current automated test suite is still the scaffolded sample test. Manual testing through `Run Extension` and `sample-config.json` is the best way to exercise the presentation workflow right now.
