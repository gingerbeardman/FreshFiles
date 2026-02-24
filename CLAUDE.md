# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fresh Files is a **Nova editor extension** (JavaScript) that provides an alternative file browser sidebar showing only recently modified files, using Git history to reduce cognitive load in large projects.

- **Extension ID:** `com.gingerbeardman.FreshFiles`
- **No build system, no npm, no external dependencies** — pure JavaScript using Nova's built-in APIs
- **No test framework or linter configured**
- To develop: open the project in Nova, which loads the extension from `Fresh Files.novaextension/`

## Architecture

All source code lives in `Fresh Files.novaextension/Scripts/`:

- **main.js** — Entry point. Registers 8 commands, sets up file/config watchers, manages TreeView lifecycle. Uses debounced refresh (2000ms) with a queue to prevent overlapping updates.
- **FreshFilesDataProvider.js** — Implements Nova's `TreeDataProvider`. Converts Git data into TreeView items. Supports flat (default) and tree layout modes, recency (default) and alphabetical sort. Handles single-child directory collapsing in tree mode. Uses glob matching for ignored patterns.
- **GitService.js** — Abstraction for Git subprocess calls. Two key methods: `getPendingFiles()` (uncommitted via `git status`) and `getHistoricalFiles()` (within time window via `git log`). Caches git root path.
- **FileItem.js** — Tree node data model with computed `fileCount` and `newestMtime` for directories.
- **TimeUtils.js** — Formats timestamps as relative strings ("2h ago", "3d ago").

## Key Patterns

- **Module system:** CommonJS (`require`/`module.exports`)
- **Config keys:** Fully qualified, e.g. `com.gingerbeardman.FreshFiles.timeWindow`
- **Private members:** Prefixed with `_` (e.g., `_flat`, `_buildTree`)
- **Error handling:** Git failures caught and logged; functions return empty arrays gracefully
- **Extension manifest:** `Fresh Files.novaextension/extension.json` defines sidebar, commands, and workspace config

## Inspiration

- https://github.com/FreHu/vscode-fresh-file-explorer
