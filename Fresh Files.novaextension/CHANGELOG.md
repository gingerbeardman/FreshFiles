## Version 3.0.x

- add: Exhume — view deleted file contents with syntax highlighting (context menu on deleted files)
- add: Resurrect — restore deleted files to their original location (pending via git checkout, historical via write-to-disk)
- add: Diff Search (Pickaxe) — find commits where a string was added or removed, file-scoped from sidebar or repo-wide from command palette
- add: Line History — view git history for the current line or selection from the command palette
- add: New File — create a new file from the sidebar context menu
- add: Show All Files — toggle to temporarily show all tracked files, overriding the time window filter
- add: Search Fresh Files — full-text search across fresh files from the command palette
- add: Move to Trash — delete files from disk via the sidebar context menu
- add: context menu options to ignore files and folders via "Add to Ignored" or "Add to .gitignore"

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
