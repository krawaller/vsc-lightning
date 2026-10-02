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

Relative file paths are resolved from the workspace root opened in the Extension Development Host window.

Use the optional top-level `fileMenus` array to define Lightning editor-toolbar actions by file path. When a configured file is active, the `Lightning` editor button can apply or revert configured diffs, open configured git refs, or return to the worktree file no matter how the file was opened. Existing `diffButtons` and `refButtons` on `file` items are still supported.

## Notes

The current automated test suite is still the scaffolded sample test. Manual testing through `Run Extension` and `sample-config.json` is the best way to exercise the presentation workflow right now.
