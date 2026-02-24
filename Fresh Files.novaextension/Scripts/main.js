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

exports.activate = function () {
    gitService = new GitService();
    fileSystemService = new FileSystemService();
    dataProvider = new FreshFilesDataProvider(gitService, fileSystemService);

    // Restore persisted layout and sort preferences
    const savedFlat = nova.workspace.config.get("com.gingerbeardman.FreshFiles.flatLayout", "boolean");
    const savedSort = nova.workspace.config.get("com.gingerbeardman.FreshFiles.sortByName", "boolean");
    if (savedFlat !== null) dataProvider._flat = savedFlat;
    if (savedSort !== null) dataProvider._sortByName = savedSort;

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

    // Watch for file changes (use "**/*" to get path info, filter out .git/)
    const watcher = nova.fs.watch("**/*", (path) => {
        if (path && (path.includes("/.git/") || path.endsWith("/.git"))) return;
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
