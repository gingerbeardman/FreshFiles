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
- remove: deleted unused layout sidebar button icon
- chore: relicense to LGPL-3.0

## Version 1.0.x

- Initial release
