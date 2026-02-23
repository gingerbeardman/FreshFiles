const FileItem = require("./FileItem.js");
const { relativeTime } = require("./TimeUtils.js");

class FreshFilesDataProvider {
    constructor(gitService) {
        this.gitService = gitService;
        this._rootItems = [];
        this._ignoredPatterns = [];
    }

    getChildren(element) {
        if (!element) {
            return this._rootItems;
        }
        return this._sortItems(element.children);
    }

    getTreeItem(element) {
        if (element.isDirectory) {
            const item = new TreeItem(element.name, TreeItemCollapsibleState.Expanded);
            item.image = "__builtin.path";
            item.identifier = element.path;
            const count = element.fileCount;
            item.descriptiveText = `${count} file${count !== 1 ? "s" : ""}`;
            item.contextValue = "directory";
            return item;
        }

        const item = new TreeItem(element.name, TreeItemCollapsibleState.None);
        item.path = element.path;
        item.identifier = element.path;
        item.command = "freshFiles.open";
        item.contextValue = "file";

        if (element.mtime) {
            item.descriptiveText = relativeTime(element.mtime);
        }

        if (element.status) {
            item.tooltip = `${element.relativePath} [${element.status}]`;
        }

        return item;
    }

    async refresh() {
        const workspacePath = nova.workspace.path;
        if (!workspacePath) {
            this._rootItems = [];
            return;
        }

        const timeWindow = nova.workspace.config.get("com.mattwoods.FreshFiles.timeWindow", "string") || "pending";
        this._ignoredPatterns = nova.workspace.config.get("com.mattwoods.FreshFiles.ignoredPatterns", "stringArray") || [];

        let files;
        if (timeWindow === "pending") {
            files = await this.gitService.getPendingFiles(workspacePath);
        } else {
            const days = parseInt(timeWindow, 10);
            files = await this.gitService.getHistoricalFiles(workspacePath, days);
        }

        // Filter ignored patterns
        if (this._ignoredPatterns.length > 0) {
            files = files.filter((f) => !this._matchesIgnored(f.relativePath));
        }

        this._rootItems = this._buildTree(files, workspacePath);
    }

    _matchesIgnored(relativePath) {
        for (const pattern of this._ignoredPatterns) {
            if (!pattern) continue;
            // Simple glob matching: support * and **
            const regex = this._globToRegex(pattern);
            if (regex.test(relativePath)) return true;
        }
        return false;
    }

    _globToRegex(glob) {
        let regex = glob
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*\*/g, "{{DOUBLESTAR}}")
            .replace(/\*/g, "[^/]*")
            .replace(/\{\{DOUBLESTAR\}\}/g, ".*")
            .replace(/\?/g, "[^/]");
        return new RegExp(`^${regex}$`);
    }

    _buildTree(files, workspacePath) {
        const dirMap = new Map();

        for (const file of files) {
            const parts = file.relativePath.split("/");
            const fileName = parts.pop();

            // Create directory chain
            let currentPath = workspacePath;
            let parentChildren = null;

            for (let i = 0; i < parts.length; i++) {
                const dirName = parts[i];
                currentPath = nova.path.join(currentPath, dirName);

                if (!dirMap.has(currentPath)) {
                    const dirItem = new FileItem(dirName, currentPath, true);
                    dirItem.relativePath = parts.slice(0, i + 1).join("/");
                    dirMap.set(currentPath, dirItem);
                }

                parentChildren = dirMap.get(currentPath);
            }

            // Create file item
            const fileItem = new FileItem(fileName, file.absolutePath, false);
            fileItem.relativePath = file.relativePath;
            fileItem.mtime = file.mtime instanceof Date ? file.mtime : new Date(file.mtime);
            fileItem.status = file.status;

            if (parentChildren) {
                // Check if child already exists
                const existing = parentChildren.children.find((c) => c.path === fileItem.path);
                if (!existing) {
                    parentChildren.addChild(fileItem);
                }
            } else {
                // Top-level file
                dirMap.set(file.absolutePath, fileItem);
            }
        }

        // Build parent-child relationships for directories
        const rootItems = [];
        for (const [path, item] of dirMap) {
            if (item.isDirectory && !item.parent) {
                // Find if this directory should be a child of another
                const parentPath = nova.path.dirname(path);
                const parentDir = dirMap.get(parentPath);
                if (parentDir && parentDir.isDirectory) {
                    const existing = parentDir.children.find((c) => c.path === item.path);
                    if (!existing) {
                        parentDir.addChild(item);
                    }
                } else {
                    rootItems.push(item);
                }
            } else if (!item.isDirectory && !item.parent) {
                rootItems.push(item);
            }
        }

        // Collapse single-child directories
        const collapsed = rootItems.map((item) => this._collapseSingleChild(item));

        // Sort and return
        return this._sortItems(collapsed);
    }

    _collapseSingleChild(item) {
        if (!item.isDirectory) return item;

        // Recursively collapse children first
        item.children = item.children.map((child) => this._collapseSingleChild(child));

        // If directory has exactly one child and it's also a directory, merge them
        while (item.children.length === 1 && item.children[0].isDirectory) {
            const child = item.children[0];
            item.name = `${item.name}/${child.name}`;
            item.path = child.path;
            item.relativePath = child.relativePath;
            item.children = child.children;
            // Re-parent children
            for (const grandchild of item.children) {
                grandchild.parent = item;
            }
        }

        return item;
    }

    _sortItems(items) {
        return [...items].sort((a, b) => {
            // Directories first
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;

            // Then by mtime descending (newest first)
            const aTime = a.isDirectory ? a.newestMtime : a.mtime;
            const bTime = b.isDirectory ? b.newestMtime : b.mtime;

            if (aTime && bTime) return bTime - aTime;
            if (aTime) return -1;
            if (bTime) return 1;
            return a.name.localeCompare(b.name);
        });
    }
}

module.exports = FreshFilesDataProvider;
