## Version 3.3.x

- fix: detect file changes from terminal and external processes (re-enable workspace file watching with noisy-dir filtering)

## Version 3.2.x

- add: respect .gitignore for display (configurable, on by default)
- change: rename "Ignored Patterns" to "Custom Ignored Patterns" (and matching context menu item) to distinguish from the new .gitignore handling
- change: shorten project settings descriptions

## Version 3.1.x

- add: configurable Max Files setting to prevent slowdowns in very large repositories (default 5,000 but can be set in Project Settings > Extensions > Fresh Files)
- fix: replace git status -uall with -unormal to avoid enumerating all untracked files
- fix: replace blanket file watcher with targeted git state watchers and document save events
- fix: add --max-count limit to git log to cap history scans
- fix: add process timeout (10s) to prevent hung git commands from blocking the extension
- fix: cache compiled ignore pattern regexes instead of recompiling per file
- fix: cap filesystem directory traversal for non-git workspaces

## Version 3.0.x

- add: Exhume — view deleted file contents with syntax highlighting (context menu on deleted files)
- add: Resurrect — restore deleted files to their original location (pending via git checkout, historical via write-to-disk)
- add: Diff Search (Pickaxe) — find commits where a string was added or removed, file-scoped from sidebar or repo-wide from command palette
- add: Line History — view git history for the current line or selection from the command palette
- add: New File — create a new file from the sidebar context menu
- add: Show All Files — toggle to temporarily show all tracked files, overriding the time window filter
- add: Search Fresh Files — full-text search across fresh files from the command palette
- add: context menu options to ignore files and folders via "Add to Ignored" or "Add to .gitignore"
- add: Move to Trash — delete files and folders from disk via the sidebar context menu
- add: Move to Trash — folders are trashed whole if they contain only changed files, otherwise just the changed files are trashed

## Version 2.0.x

- add: filesystem mtime fallback for non-Git workspaces — Fresh Files now works in any folder
- add: deleted file display with distinct icon and "deleted" label
- add: pinned files section that persists across time window changes
- add: file history via right-click context menu, showing commit list with diffs
- add: command palette entries: Toggle Sort Order, Toggle Layout, Cycle Time Window, Quick Open Fresh File
- change: "Pending Changes" falls back to a 1-day mtime window in non-Git mode
- change: Show File History shows an informative message when no Git repository is available
- change: skip common non-project directories (node_modules, build, .git, etc.) during filesystem scan
- change: sidebar icons have been redone to match extension icon and are now antialiased
- fix: sidebar now refreshes after external git commits, checkouts, and merges
- fix: add missing clipboard entitlement for copy path commands
- remove: deleted unused layout sidebar button icon
- chore: relicense to LGPL-3.0
- chore: add screenshot

## Version 1.0.x

- Initial release
