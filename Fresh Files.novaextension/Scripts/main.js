const GitService = require("./GitService.js");
const FreshFilesDataProvider = require("./FreshFilesDataProvider.js");

const TIME_WINDOWS = ["pending", "7", "30", "90"];
const TIME_WINDOW_LABELS = {
    pending: "Pending Changes",
    7: "Last 7 Days",
    30: "Last 30 Days",
    90: "Last 90 Days",
    180: "Last 180 Days"
};

let treeView = null;
let dataProvider = null;
let gitService = null;
let refreshTimer = null;

function debounceRefresh() {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(async () => {
        refreshTimer = null;
        await doRefresh();
    }, 1000);
}

async function doRefresh() {
    if (!dataProvider || !treeView) return;
    try {
        await dataProvider.refresh();
        treeView.reload();
    } catch (err) {
        console.error("Fresh Files refresh error:", err.message);
    }
}

function getCurrentTimeWindow() {
    return nova.workspace.config.get("com.mattwoods.FreshFiles.timeWindow", "string") || "pending";
}

exports.activate = function () {
    gitService = new GitService();
    dataProvider = new FreshFilesDataProvider(gitService);

    treeView = new TreeView("com.mattwoods.FreshFiles.section", {
        dataProvider: dataProvider
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
                if (!item.isDirectory) {
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
                if (!item.isDirectory) {
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
            }
        })
    );

    nova.subscriptions.add(
        nova.commands.register("freshFiles.copyPath", () => {
            const selection = treeView.selection;
            if (selection && selection.length > 0) {
                const item = selection[0];
                if (!item.isDirectory) {
                    nova.clipboard.writeText(item.path);
                }
            }
        })
    );

    nova.subscriptions.add(
        nova.commands.register("freshFiles.copyRelativePath", () => {
            const selection = treeView.selection;
            if (selection && selection.length > 0) {
                const item = selection[0];
                if (!item.isDirectory) {
                    nova.clipboard.writeText(item.relativePath);
                }
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
                    nova.workspace.config.set("com.mattwoods.FreshFiles.timeWindow", keys[index]);
                }
            });
        })
    );

    nova.subscriptions.add(
        nova.commands.register("freshFiles.cycleTimeWindow", () => {
            const current = getCurrentTimeWindow();
            const idx = TIME_WINDOWS.indexOf(current);
            const next = TIME_WINDOWS[(idx + 1) % TIME_WINDOWS.length];
            nova.workspace.config.set("com.mattwoods.FreshFiles.timeWindow", next);

            // Show brief notification of the new window
            const label = TIME_WINDOW_LABELS[next] || next;
            console.log("Fresh Files: switched to", label);
        })
    );

    // Watch for file changes
    const watcher = nova.fs.watch(null, () => {
        debounceRefresh();
    });
    nova.subscriptions.add(watcher);

    // Watch for config changes
    nova.subscriptions.add(
        nova.workspace.config.onDidChange("com.mattwoods.FreshFiles.timeWindow", () => {
            doRefresh();
        })
    );

    nova.subscriptions.add(
        nova.workspace.config.onDidChange("com.mattwoods.FreshFiles.ignoredPatterns", () => {
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
};
