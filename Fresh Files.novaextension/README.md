**Fresh Files** provides a sidebar that shows only recently modified files, using Git history to surface the files you're actively working on.

Ideal if the Files sidebar is too much, or you lose track of your work immediately after a commit.

Inspired by [Fresh File Explorer](https://github.com/FreHu/vscode-fresh-file-explorer) for VS Code.

## Requirements

- A workspace that is a **Git repository** (Fresh Files uses `git status` and `git log`)

## Usage

To use Fresh Files:

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

- **Pending Changes** shows uncommitted files from `git status`
- **Historical** shows files modified within a time window (1 hour, 4 hours, 1 day, 3/7/14/30/90/180 days) from `git log`

## Features

- Directory tree with collapsed single-child directories
- Flat list mode (default) showing filenames with relative path as tooltip
- Sort by recency (newest first, default) or alphabetically
- Layout and sort preferences remembered per workspace
- Relative time display ("2h ago", "3d ago")
- File count on directories
- Auto-refresh on file changes

## Context Menu

Right-click on any file or directory to:

- Show in Finder
- Copy Path
- Copy Relative Path

## Configuration

Per-workspace settings are available in **Project > Project Settings > Fresh Files**:

- **Time Window** — which time period to show
- **Ignored Patterns** — glob patterns for files to hide
