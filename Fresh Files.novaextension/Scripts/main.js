const GitService = require("./GitService.js");
const FileSystemService = require("./FileSystemService.js");
const FreshFilesDataProvider = require("./FreshFilesDataProvider.js");
const { relativeTime } = require("./TimeUtils.js");

const TIME_WINDOWS = ["pending", "1h", "4h", "1d", "3d", "7d", "14d", "30d", "90d", "180d", "360d"];
const TIME_WINDOW_LABELS = {
    pending: "Pending Changes",
    "1h": "Last 1 Hour",
    "4h": "Last 4 Hours",
    "1d": "Last 1 Day",
    "3d": "Last 3 Days",
    "7d": "Last 7 Days",
    "14d": "Last 14 Days",
    "30d": "Last 30 Days",
    "90d": "Last 90 Days",
    "180d": "Last 180 Days",
    "360d": "Last 360 Days"
};

let treeView = null;
let dataProvider = null;
let gitService = null;
let fileSystemService = null;
let refreshTimer = null;
let isRefreshing = false;
let refreshQueued = false;

function debounceRefresh() {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(() => {
        refreshTimer = null;
        doRefresh();
    }, 2000);
}

async function doRefresh() {
    if (!dataProvider || !treeView) return;

    // Prevent overlapping refreshes; queue one if already running
    if (isRefreshing) {
        refreshQueued = true;
        return;
    }

    isRefreshing = true;
    try {
        await dataProvider.refresh();
        treeView.reload();
    } catch (err) {
        console.error("Fresh Files refresh error:", err.message);
    } finally {
        isRefreshing = false;
        if (refreshQueued) {
            refreshQueued = false;
            debounceRefresh();
        }
    }
}

function getCurrentTimeWindow() {
    return nova.workspace.config.get("com.gingerbeardman.FreshFiles.timeWindow", "string") || "pending";
}

const SYNTAX_MAP = {
    ".js": "javascript", ".jsx": "jsx", ".ts": "typescript", ".tsx": "tsx",
    ".json": "json", ".html": "html", ".htm": "html", ".css": "css",
    ".scss": "scss", ".less": "less", ".py": "python", ".rb": "ruby",
    ".swift": "swift", ".m": "objc", ".mm": "objcpp", ".h": "objc",
    ".c": "c", ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp",
    ".java": "java", ".kt": "kotlin", ".go": "go", ".rs": "rust",
    ".php": "php", ".lua": "lua", ".pl": "perl", ".sh": "shell",
    ".bash": "shell", ".zsh": "shell", ".xml": "xml", ".yaml": "yaml",
    ".yml": "yaml", ".toml": "toml", ".md": "markdown", ".markdown": "markdown",
    ".sql": "sql", ".r": "r", ".R": "r", ".dart": "dart",
    ".ex": "elixir", ".exs": "elixir", ".erl": "erlang",
    ".hs": "haskell", ".scala": "scala", ".clj": "clojure",
    ".vim": "viml", ".diff": "diff", ".patch": "diff",
    ".ini": "ini", ".cfg": "ini", ".conf": "ini"
};

function syntaxForPath(filePath) {
    const ext = nova.path.extname(filePath);
    return ext ? (SYNTAX_MAP[ext] || null) : null;
}

function _ensureDirectoryExists(dirPath) {
    if (nova.fs.stat(dirPath)) return;
    const parts = [];
    let current = dirPath;
    while (!nova.fs.stat(current)) {
        parts.unshift(current);
        current = nova.path.dirname(current);
    }
    for (const dir of parts) {
        nova.fs.mkdir(dir);
    }
}

async function _performDiffSearch(filePath) {
    const workspacePath = nova.workspace.path;
    if (!workspacePath) return;

    if (!gitService || !gitService.isGitRepo) {
        nova.workspace.showInformativeMessage("Diff Search requires a Git repository.");
        return;
    }

    const scope = filePath ? nova.path.basename(filePath) : "repo";

    nova.workspace.showInputPalette(`Search string (in ${scope})…`, { placeholder: "Enter text to search for" }, async (searchString) => {
        if (!searchString) return;

        const commits = await gitService.pickaxeSearch(workspacePath, searchString, filePath);
        if (commits.length === 0) {
            nova.workspace.showWarningMessage(`No commits found where "${searchString}" was added or removed.`);
            return;
        }

        const choices = commits.map((c) => {
            const shortHash = c.hash.substring(0, 7);
            const age = relativeTime(c.date);
            return `${shortHash} — ${c.message} (${age})`;
        });

        nova.workspace.showChoicePalette(choices, { placeholder: "Select a commit" }, async (choice, index) => {
            if (choice === null || index === undefined) return;

            const commit = commits[index];
            try {
                const diffOutput = await gitService.getPickaxeDiff(workspacePath, commit.hash, searchString);

                const storageDir = nova.extension.workspaceStoragePath;
                nova.fs.mkdir(storageDir);
                const shortHash = commit.hash.substring(0, 7);
                const safeName = searchString.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 30);
                const tempPath = nova.path.join(storageDir, `pickaxe-${safeName}-${shortHash}.diff`);

                const file = nova.fs.open(tempPath, "w");
                file.write(diffOutput || "No diff available.");
                file.close();

                nova.workspace.openFile(tempPath);
            } catch (err) {
                console.error("Failed to get pickaxe diff:", err.message);
            }
        });
    });
}

exports.activate = function () {
    gitService = new GitService();
    fileSystemService = new FileSystemService();
    dataProvider = new FreshFilesDataProvider(gitService, fileSystemService);

    // Restore persisted layout and sort preferences
    const savedFlat = nova.workspace.config.get("com.gingerbeardman.FreshFiles.flatLayout", "boolean");
    const savedSort = nova.workspace.config.get("com.gingerbeardman.FreshFiles.sortByName", "boolean");
    const savedShowAll = nova.workspace.config.get("com.gingerbeardman.FreshFiles.showAll", "boolean");
    if (savedFlat !== null) dataProvider._flat = savedFlat;
    if (savedSort !== null) dataProvider._sortByName = savedSort;
    if (savedShowAll !== null) dataProvider._showAll = savedShowAll;

    treeView = new TreeView("com.gingerbeardman.FreshFiles.section", {
        dataProvider: dataProvider
    });

    // Single-click to open file
    treeView.onDidChangeSelection((selection) => {
        if (selection && selection.length > 0) {
            const item = selection[0];
            if (!item.isDirectory && !item.isDeleted && item.path) {
                nova.workspace.openFile(item.path);
            }
        }
    });

    // Register commands
    nova.subscriptions.add(
        nova.commands.register("freshFiles.refresh", () => {
            doRefresh();
        })
    );

    nova.subscriptions.add(
        nova.commands.register("freshFiles.open", () => {
            const selection = treeView.selection;
            if (selection && selection.length > 0) {
                const item = selection[0];
                if (!item.isDirectory && !item.isDeleted && item.path) {
                    nova.workspace.openFile(item.path);
                }
            }
        })
    );

    nova.subscriptions.add(
        nova.commands.register("freshFiles.revealInFinder", () => {
            const selection = treeView.selection;
            if (selection && selection.length > 0) {
                const item = selection[0];
                if (item.isDeleted) return;
                const process = new Process("/usr/bin/open", {
                    args: ["-R", item.path]
                });
                process.onDidExit((status) => {
                    if (status !== 0) {
                        console.error("Failed to reveal in Finder:", item.path);
                    }
                });
                process.start();
            }
        })
    );

    nova.subscriptions.add(
        nova.commands.register("freshFiles.copyPath", () => {
            const selection = treeView.selection;
            if (selection && selection.length > 0) {
                const item = selection[0];
                nova.clipboard.writeText(item.path);
            }
        })
    );

    nova.subscriptions.add(
        nova.commands.register("freshFiles.copyRelativePath", () => {
            const selection = treeView.selection;
            if (selection && selection.length > 0) {
                const item = selection[0];
                nova.clipboard.writeText(item.relativePath);
            }
        })
    );

    nova.subscriptions.add(
        nova.commands.register("freshFiles.setTimeWindow", () => {
            const options = Object.keys(TIME_WINDOW_LABELS).map((key) => TIME_WINDOW_LABELS[key]);
            const keys = Object.keys(TIME_WINDOW_LABELS);
            const current = getCurrentTimeWindow();
            const currentIndex = keys.indexOf(current);

            nova.workspace.showChoicePalette(options, { placeholder: "Select time window" }, (choice, index) => {
                if (choice !== null && index !== undefined) {
                    nova.workspace.config.set("com.gingerbeardman.FreshFiles.timeWindow", keys[index]);
                }
            });
        })
    );

    nova.subscriptions.add(
        nova.commands.register("freshFiles.cycleTimeWindow", () => {
            const current = getCurrentTimeWindow();
            const idx = TIME_WINDOWS.indexOf(current);
            const next = TIME_WINDOWS[(idx + 1) % TIME_WINDOWS.length];
            nova.workspace.config.set("com.gingerbeardman.FreshFiles.timeWindow", next);

            // Show brief notification of the new window
            const label = TIME_WINDOW_LABELS[next] || next;
            console.log("Fresh Files: switched to", label);
        })
    );

    nova.subscriptions.add(
        nova.commands.register("freshFiles.toggleFlat", () => {
            dataProvider._flat = !dataProvider._flat;
            nova.workspace.config.set("com.gingerbeardman.FreshFiles.flatLayout", dataProvider._flat);
            doRefresh();
        })
    );

    nova.subscriptions.add(
        nova.commands.register("freshFiles.toggleSort", () => {
            dataProvider._sortByName = !dataProvider._sortByName;
            nova.workspace.config.set("com.gingerbeardman.FreshFiles.sortByName", dataProvider._sortByName);
            doRefresh();
        })
    );

    // Pin file command
    nova.subscriptions.add(
        nova.commands.register("freshFiles.pinFile", () => {
            const selection = treeView.selection;
            if (!selection || selection.length === 0) return;
            const item = selection[0];
            if (item.isDirectory || item.isPinned) return;

            const pinnedFiles = nova.workspace.config.get("com.gingerbeardman.FreshFiles.pinnedFiles", "stringArray") || [];
            if (!pinnedFiles.includes(item.relativePath)) {
                pinnedFiles.push(item.relativePath);
                nova.workspace.config.set("com.gingerbeardman.FreshFiles.pinnedFiles", pinnedFiles);
            }
        })
    );

    // Unpin file command
    nova.subscriptions.add(
        nova.commands.register("freshFiles.unpinFile", () => {
            const selection = treeView.selection;
            if (!selection || selection.length === 0) return;
            const item = selection[0];
            if (item.isDirectory || !item.isPinned) return;

            const pinnedFiles = nova.workspace.config.get("com.gingerbeardman.FreshFiles.pinnedFiles", "stringArray") || [];
            const index = pinnedFiles.indexOf(item.relativePath);
            if (index !== -1) {
                pinnedFiles.splice(index, 1);
                nova.workspace.config.set("com.gingerbeardman.FreshFiles.pinnedFiles", pinnedFiles);
            }
        })
    );

    // Search in Fresh Files
    nova.subscriptions.add(
        nova.commands.register("freshFiles.searchFiles", () => {
            if (!dataProvider) return;

            // Collect all non-directory, non-deleted file items
            const allFiles = [];
            function collectFiles(items) {
                for (const item of items) {
                    if (item.isDirectory) {
                        collectFiles(item.children);
                    } else if (!item.isDeleted) {
                        allFiles.push(item);
                    }
                }
            }
            collectFiles(dataProvider._rootItems);

            if (allFiles.length === 0) {
                nova.workspace.showInformativeMessage("No files to search.");
                return;
            }

            nova.workspace.showInputPalette("Search Fresh Files…", { placeholder: "Enter filename to search" }, (query) => {
                if (!query) return;

                const lowerQuery = query.toLowerCase();
                const matches = allFiles.filter((f) => f.relativePath.toLowerCase().includes(lowerQuery));

                if (matches.length === 0) {
                    nova.workspace.showInformativeMessage(`No files matching "${query}".`);
                    return;
                }

                const choices = matches.map((f) => f.relativePath);
                nova.workspace.showChoicePalette(choices, { placeholder: `${matches.length} match${matches.length !== 1 ? "es" : ""}` }, (choice, index) => {
                    if (choice === null || index === undefined) return;
                    nova.workspace.openFile(matches[index].path);
                });
            });
        })
    );

    // Show file history command
    nova.subscriptions.add(
        nova.commands.register("freshFiles.showFileHistory", async () => {
            const selection = treeView.selection;
            if (!selection || selection.length === 0) return;
            const item = selection[0];
            if (item.isDirectory) return;

            const workspacePath = nova.workspace.path;
            if (!workspacePath) return;

            if (!gitService.isGitRepo) {
                nova.workspace.showInformativeMessage("File history requires a Git repository.");
                return;
            }

            const commits = await gitService.getFileHistory(workspacePath, item.path);
            if (commits.length === 0) {
                nova.workspace.showWarningMessage("No history found for this file.");
                return;
            }

            const choices = commits.map((c) => {
                const shortHash = c.hash.substring(0, 7);
                const age = relativeTime(c.date);
                return `${shortHash} — ${c.message} (${age})`;
            });

            nova.workspace.showChoicePalette(choices, { placeholder: "Select a commit" }, async (choice, index) => {
                if (choice === null || index === undefined) return;

                const commit = commits[index];
                const gitRoot = await gitService.getGitRoot(workspacePath);
                const relativePath = gitService._relativeTo(item.path, gitRoot);

                try {
                    const diffOutput = await gitService.runProcess(
                        "/usr/bin/git",
                        ["diff", `${commit.hash}~1`, commit.hash, "--", relativePath],
                        workspacePath
                    );

                    // Write diff to temp file in workspace storage
                    const storageDir = nova.extension.workspaceStoragePath;
                    nova.fs.mkdir(storageDir);
                    const shortHash = commit.hash.substring(0, 7);
                    const baseName = nova.path.basename(item.path);
                    const tempPath = nova.path.join(storageDir, `${baseName}-${shortHash}.diff`);

                    const file = nova.fs.open(tempPath, "w");
                    file.write(diffOutput || "No diff available (initial commit?)");
                    file.close();

                    nova.workspace.openFile(tempPath);
                } catch (err) {
                    console.error("Failed to get diff:", err.message);
                }
            });
        })
    );

    // Exhume — view deleted file content
    nova.subscriptions.add(
        nova.commands.register("freshFiles.exhume", async () => {
            const selection = treeView.selection;
            if (!selection || selection.length === 0) return;
            const item = selection[0];
            if (!item.isDeleted) return;

            const workspacePath = nova.workspace.path;
            if (!workspacePath) return;

            if (!gitService.isGitRepo) {
                nova.workspace.showInformativeMessage("Exhume requires a Git repository.");
                return;
            }

            const isPending = getCurrentTimeWindow() === "pending";
            const content = await gitService.getDeletedFileContent(workspacePath, item.relativePath, isPending);
            if (content === null) {
                nova.workspace.showWarningMessage("Could not retrieve content for this deleted file.");
                return;
            }

            // Write to temp file with original name for syntax detection
            const storageDir = nova.extension.workspaceStoragePath;
            nova.fs.mkdir(storageDir);
            const baseName = nova.path.basename(item.relativePath);
            const tempPath = nova.path.join(storageDir, `exhumed-${baseName}`);

            const file = nova.fs.open(tempPath, "w");
            file.write(content);
            file.close();

            const editor = await nova.workspace.openFile(tempPath);
            if (editor) {
                const syntax = syntaxForPath(item.relativePath);
                if (syntax) {
                    editor.syntax = syntax;
                }
            }
        })
    );

    // Resurrect — restore deleted file to disk
    nova.subscriptions.add(
        nova.commands.register("freshFiles.resurrect", async () => {
            const selection = treeView.selection;
            if (!selection || selection.length === 0) return;
            const item = selection[0];
            if (!item.isDeleted) return;

            const workspacePath = nova.workspace.path;
            if (!workspacePath) return;

            if (!gitService.isGitRepo) {
                nova.workspace.showInformativeMessage("Resurrect requires a Git repository.");
                return;
            }

            const isPending = getCurrentTimeWindow() === "pending";

            if (isPending) {
                const success = await gitService.restoreDeletedFilePending(workspacePath, item.relativePath);
                if (success) {
                    doRefresh();
                } else {
                    nova.workspace.showWarningMessage("Failed to restore the deleted file.");
                }
            } else {
                // Historical: get content and write to disk
                const targetPath = nova.path.join(workspacePath, item.relativePath);

                // Check if file already exists
                if (nova.fs.stat(targetPath)) {
                    nova.workspace.showWarningMessage("A file already exists at this path. Cannot overwrite.");
                    return;
                }

                const content = await gitService.getDeletedFileContent(workspacePath, item.relativePath, false);
                if (content === null) {
                    nova.workspace.showWarningMessage("Could not retrieve content for this deleted file.");
                    return;
                }

                // Ensure parent directory exists
                _ensureDirectoryExists(nova.path.dirname(targetPath));

                const file = nova.fs.open(targetPath, "w");
                file.write(content);
                file.close();

                doRefresh();
            }
        })
    );

    // Diff Search — scoped to selected file from sidebar
    nova.subscriptions.add(
        nova.commands.register("freshFiles.diffSearch", async () => {
            const selection = treeView.selection;
            let filePath = null;
            if (selection && selection.length > 0) {
                const item = selection[0];
                if (!item.isDirectory) {
                    filePath = item.path;
                }
            }
            await _performDiffSearch(filePath);
        })
    );

    // Diff Search (Repo-wide) — from command palette
    nova.subscriptions.add(
        nova.commands.register("freshFiles.diffSearchRepo", async () => {
            await _performDiffSearch(null);
        })
    );

    // Line History — from command palette, uses active editor
    nova.subscriptions.add(
        nova.commands.register("freshFiles.lineHistory", async () => {
            const editor = nova.workspace.activeTextEditor;
            if (!editor) {
                nova.workspace.showInformativeMessage("No active editor. Open a file first.");
                return;
            }

            const workspacePath = nova.workspace.path;
            if (!workspacePath) return;

            if (!gitService || !gitService.isGitRepo) {
                nova.workspace.showInformativeMessage("Line History requires a Git repository.");
                return;
            }

            const filePath = editor.document.path;
            if (!filePath) {
                nova.workspace.showInformativeMessage("This file has no path (unsaved).");
                return;
            }

            const selectedRange = editor.selectedRange;
            const fullText = editor.document.getTextInRange(new Range(0, editor.document.length));

            // Convert character offsets to line numbers
            const textBeforeStart = fullText.substring(0, selectedRange.start);
            const startLine = (textBeforeStart.match(/\n/g) || []).length + 1;

            const textBeforeEnd = fullText.substring(0, selectedRange.end);
            const endLine = (textBeforeEnd.match(/\n/g) || []).length + 1;

            const output = await gitService.getLineHistory(workspacePath, filePath, startLine, endLine);
            if (!output || !output.trim()) {
                nova.workspace.showWarningMessage("No line history found. The file may be untracked.");
                return;
            }

            const storageDir = nova.extension.workspaceStoragePath;
            nova.fs.mkdir(storageDir);
            const baseName = nova.path.basename(filePath);
            const lineLabel = startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`;
            const tempPath = nova.path.join(storageDir, `${baseName}-${lineLabel}-history.diff`);

            const file = nova.fs.open(tempPath, "w");
            file.write(output);
            file.close();

            nova.workspace.openFile(tempPath);
        })
    );

    // Quick open fresh file
    nova.subscriptions.add(
        nova.commands.register("freshFiles.quickOpen", () => {
            if (!dataProvider) return;

            // Collect all non-directory, non-deleted file items
            const allFiles = [];
            function collectFiles(items) {
                for (const item of items) {
                    if (item.isDirectory) {
                        collectFiles(item.children);
                    } else if (!item.isDeleted) {
                        allFiles.push(item);
                    }
                }
            }
            collectFiles(dataProvider._rootItems);

            if (allFiles.length === 0) return;

            const choices = allFiles.map((f) => f.relativePath);

            nova.workspace.showChoicePalette(choices, { placeholder: "Open Fresh File..." }, (choice, index) => {
                if (choice === null || index === undefined) return;
                nova.workspace.openFile(allFiles[index].path);
            });
        })
    );

    // New File — create a new file in the selected directory or workspace root
    nova.subscriptions.add(
        nova.commands.register("freshFiles.newFile", () => {
            const workspacePath = nova.workspace.path;
            if (!workspacePath) return;

            // Determine target directory from selection
            let targetDir = workspacePath;
            const selection = treeView.selection;
            if (selection && selection.length > 0) {
                const item = selection[0];
                if (item.isDirectory) {
                    targetDir = item.path;
                } else if (item.path) {
                    targetDir = nova.path.dirname(item.path);
                }
            }

            nova.workspace.showInputPalette("New file name:", { placeholder: "filename.ext" }, (name) => {
                if (!name) return;
                const newPath = nova.path.join(targetDir, name);

                if (nova.fs.stat(newPath)) {
                    nova.workspace.showWarningMessage("A file already exists at this path.");
                    return;
                }

                _ensureDirectoryExists(nova.path.dirname(newPath));
                const file = nova.fs.open(newPath, "w");
                file.write("");
                file.close();

                nova.workspace.openFile(newPath);
            });
        })
    );

    // Toggle Show All Files — temporarily show all tracked files
    nova.subscriptions.add(
        nova.commands.register("freshFiles.toggleShowAll", () => {
            if (!dataProvider) return;
            dataProvider._showAll = !dataProvider._showAll;
            nova.workspace.config.set("com.gingerbeardman.FreshFiles.showAll", dataProvider._showAll);
            doRefresh();
        })
    );

    // Watch for file changes; allow git state files (index, HEAD, refs) through
    const watcher = nova.fs.watch("**/*", (path) => {
        if (path && (path.includes("/.git/") || path.endsWith("/.git"))) {
            // Only refresh on git state changes (commit, checkout, merge, etc.)
            if (path.endsWith("/.git/index") || path.endsWith("/.git/HEAD") || path.includes("/.git/refs/")) {
                debounceRefresh();
            }
            return;
        }
        debounceRefresh();
    });
    nova.subscriptions.add(watcher);

    // Watch for config changes
    nova.subscriptions.add(
        nova.workspace.config.onDidChange("com.gingerbeardman.FreshFiles.timeWindow", () => {
            doRefresh();
        })
    );

    nova.subscriptions.add(
        nova.workspace.config.onDidChange("com.gingerbeardman.FreshFiles.ignoredPatterns", () => {
            doRefresh();
        })
    );

    nova.subscriptions.add(
        nova.workspace.config.onDidChange("com.gingerbeardman.FreshFiles.pinnedFiles", () => {
            doRefresh();
        })
    );

    // Add treeView to subscriptions for cleanup
    nova.subscriptions.add(treeView);

    // Initial refresh
    doRefresh();
};

exports.deactivate = function () {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
    }
    treeView = null;
    dataProvider = null;
    gitService = null;
    fileSystemService = null;
};
