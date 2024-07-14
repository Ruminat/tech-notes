### VS Code

My settings:

```json
{
  "editor.fontSize": 12,
  "editor.fontFamily": "JetBrains Mono Regular",
  "editor.fontLigatures": true,
  "javascript.preferences.importModuleSpecifier": "relative",
  "typescript.preferences.importModuleSpecifier": "relative",
  "files.exclude": {
    "**/.git": true,
    "**/.svn": true,
    "**/.hg": true,
    "**/CVS": true,
    "**/.DS_Store": true,
    "**/node_modules": true,
    "**/__pycache__": true,
    "**/env": true
  },
  "files.trimTrailingWhitespace": true,
  "editor.tabSize": 2,
  "editor.multiCursorModifier": "ctrlCmd",
  "editor.snippetSuggestions": "top",
  "git.enableSmartCommit": true,
  "git.autofetch": true,
  "javascript.updateImportsOnFileMove.enabled": "always",
  "explorer.confirmDelete": false,
  "git.confirmSync": false,
  "workbench.iconTheme": "material-icon-theme",
  "editor.formatOnSave": true,
  "emmet.includeLanguages": {
    "typescript": "html"
  },
  "typescript.updateImportsOnFileMove.enabled": "always",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
  },
  "prettier.printWidth": 120,
  "security.workspace.trust.untrustedFiles": "open",
  "explorer.confirmDragAndDrop": false,
  "typescript.preferences.quoteStyle": "double",
  "editor.wordWrap": "on",
  "prettier.jsxSingleQuote": true,
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[javascriptreact]": {
    "editor.defaultFormatter": "vscode.typescript-language-features"
  },
  "git.ignoreRebaseWarning": true
}
```

My keyboard shortcuts:

```javascript
[
  {
    "key": "ctrl+tab",
    "command": "workbench.action.nextEditor"
  },
  {
    "key": "ctrl+shift+tab",
    "command": "workbench.action.previousEditor"
  },
  {
    "key": "ctrl+b",
    "command": "workbench.action.debug.run"
  },
]
```

My favorite packages:

- [Code Spell Checker](https://marketplace.visualstudio.com/items?itemName=streetsidesoftware.code-spell-checker).
- [Material Icon Theme](https://marketplace.visualstudio.com/items?itemName=PKief.material-icon-theme).
