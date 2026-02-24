**Fresh Files** provides a sidebar that shows only recently modified files, helping you focus on the files you're actively working on.

In Git repositories it uses `git status` and `git log`. In non-Git workspaces it falls back to filesystem modification times, so it works in any folder.

Ideal if the Files sidebar is too much, or you lose track of your work immediately after a commit.

![](https://raw.githubusercontent.com/gingerbeardman/FreshFiles/refs/heads/main/screenshot.png)

Inspired by [Fresh File Explorer](https://github.com/FreHu/vscode-fresh-file-explorer) for VS Code.

## Usage

1. Select the **View > Sidebars > Show All Sidebars** menu item
2. Click the **Fresh Files** sidebar icon

For more frequent access you can drag the **Fresh Files** icon to:

- the **Sidebar Dock** for toggling between sidebars
- a window edge to have a split sidebar

## Sidebar Header Buttons

- **Sort** — toggle between most recent first and alphabetical order
- **Flat/Tree** — toggle between a flat file list and a directory tree
- **Time Window** — pick which time period to show

## Time Window

Fresh Files has two modes:

- **Pending Changes** — in Git repos shows uncommitted files from `git status`; in non-Git workspaces shows files modified in the last day
- **Historical** — shows files modified within a time window (1 hour to 180 days) using `git log` or filesystem timestamps

## Features

- Works in any workspace — Git or non-Git
- Pin files to keep them visible regardless of time window
- Show File History for any file (Git repos only)
- Directory tree with collapsed single-child directories
- Flat list mode (default) showing filenames with relative path as tooltip
- Sort by recency (newest first, default) or alphabetically
- Layout and sort preferences remembered per workspace
- Relative time display ("2h ago", "3d ago")
- Deleted file indicators
- File count on directories
- Auto-refresh on file changes

## Context Menu

Right-click on any file to:

- Show in Finder
- Copy Path / Copy Relative Path
- Pin File / Unpin File
- Show File History (Git repos only)

## Command Palette

- Refresh Fresh Files
- Set Time Window
- Cycle Time Window
- Toggle Sort Order
- Toggle Layout (Flat/Tree)
- Quick Open Fresh File

## Configuration

Per-workspace settings are available in **Project > Project Settings > Fresh Files**:

- **Time Window** — which time period to show
- **Ignored Patterns** — glob patterns for files to hide
- **Pinned Files** — files pinned to always appear in the sidebar
