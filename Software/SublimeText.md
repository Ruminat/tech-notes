### Sublime text

**My settings**:

```javascript
{
  "auto_complete_triggers":
  [
    {
      "characters": "<",
      "selector": "text.html",
    },
    {
      "characters": ".",
      "selector": "source.sql",
    }
  ],
  "color_scheme": "Packages/Color Scheme - Default/Monokai.sublime-color-scheme",
  "file_exclude_patterns":
  [
    "*.out",
    "*.log",
    "*.ilg",
    "*.idx",
    "*.aux",
    "*.ind",
    "*.toc",
    "*.pdf",
    "*.fls",
    "*.*_latexmk",
    "*.bbl",
    "*.bcf",
    "*.blg",
    "*.run.xml",
    "*.ini",
    "*.exe",
    "*.exe",
    "*.filters",
    "*.db",
    "*.sln",
    "*.vcxproj"
  ],
  "font_face": "JetBrains Mono Regular",
  "font_options":
  [
    "dlig"
  ],
  "font_size": 9,
  "ignored_packages":
  [
    "C++11",
    "Todo",
    "Vintage",
  ],
  "show_encoding": true,
  "tab_size": 2,
  "translate_tabs_to_spaces": true,
  "word_wrap": true,
  "theme": "Default Dark.sublime-theme",
  "index_files": true,
}
```

**My keyboard shortcuts**:

```javascript
[
  { "keys": ["ctrl+pagedown"], "command": "next_view_in_stack" },
  { "keys": ["ctrl+pageup"], "command": "prev_view_in_stack" },

  // Next tab
  { "keys": ["ctrl+tab"], "command": "next_view" },
  // Previous tab
  { "keys": ["ctrl+shift+tab"], "command": "prev_view" },

  // Cancel build
  {"keys": ["ctrl+shift+c"], "command": "cancel_build"},
  // Capitalize
  {"keys": ["ctrl+t"], "command": "title_case"},
]
```

**My favorite packages**:

- [Transcrypt](https://packagecontrol.io/packages/Transcrypt).
- [ToDone](https://packagecontrol.io/packages/ToDone).
