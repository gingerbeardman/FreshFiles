const FileItem = require("./FileItem.js");
const { relativeTime } = require("./TimeUtils.js");

class FreshFilesDataProvider {
    constructor(gitService, fileSystemService) {
        this.gitService = gitService;
        this.fileSystemService = fileSystemService;
        this._rootItems = [];
        this._ignoredPatterns = [];
        this._flat = true;
        this._sortByName = false;
        this._showAll = false;
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
            item.identifier = element.path;
            // Pinned section header gets a bookmark icon
            if (element._isPinnedSection) {
                item.image = "__symbol.bookmark";
            } else {
                item.image = "folder";
            }
            const count = element.fileCount;
            item.descriptiveText = `${count} file${count !== 1 ? "s" : ""}`;
            item.contextValue = "directory";
            return item;
        }

        // Deleted files: distinct icon, no command, special descriptiveText
        if (element.isDeleted) {
            const item = new TreeItem(element.name, TreeItemCollapsibleState.None);
            item.image = "__symbol.remove";
            item.identifier = element.path;
            item.contextValue = "deleted";
            if (element.mtime) {
                item.descriptiveText = `deleted · ${relativeTime(element.mtime)}`;
            } else {
                item.descriptiveText = "deleted";
            }
            item.tooltip = element.relativePath;
            return item;
        }

        const item = new TreeItem(element.name, TreeItemCollapsibleState.None);
        item.identifier = element.path;
        item.command = "freshFiles.open";
        item.contextValue = "file";

        item.image = this._fileTypeImage(element.name);
        if (element.mtime) {
            item.descriptiveText = relativeTime(element.mtime);
        }

        item.tooltip = element.isPinned ? `${element.relativePath} (pinned)` : element.relativePath;

        return item;
    }

    _fileTypeImage(filename) {
        const ext = nova.path.extname(filename).replace(/^\./, "");
        return ext ? `__filetype.${ext}` : "__filetype.blank";
    }

    _parseCutoffDate(timeWindow) {
        const match = timeWindow.match(/^(\d+)(h|d)$/);
        if (match) {
            const num = parseInt(match[1], 10);
            const unit = match[2];
            const now = new Date();
            if (unit === "h") {
                return new Date(now.getTime() - num * 60 * 60 * 1000);
            } else {
                return new Date(now.getTime() - num * 24 * 60 * 60 * 1000);
            }
        }
        // Fallback: 1 day ago
        return new Date(Date.now() - 24 * 60 * 60 * 1000);
    }

    async refresh() {
        const workspacePath = nova.workspace.path;
        if (!workspacePath) {
            this._rootItems = [];
            return;
        }

        // Check for git repo (also primes the cache)
        await this.gitService.getGitRoot(workspacePath);
        const isGit = this.gitService.isGitRepo;

        const timeWindow = nova.workspace.config.get("com.gingerbeardman.FreshFiles.timeWindow", "string") || "pending";
        this._ignoredPatterns = nova.workspace.config.get("com.gingerbeardman.FreshFiles.ignoredPatterns", "stringArray") || [];

        let files;
        if (isGit) {
            if (this._showAll) {
                files = await this.gitService.getAllTrackedFiles(workspacePath);
            } else if (timeWindow === "pending") {
                files = await this.gitService.getPendingFiles(workspacePath);
            } else {
                // Parse "1h", "4h", "1d", "3d" etc. into git --since argument
                const match = timeWindow.match(/^(\d+)(h|d)$/);
                let sinceArg;
                if (match) {
                    const num = match[1];
                    const unit = match[2] === "h" ? "hours" : "days";
                    sinceArg = `${num}.${unit}.ago`;
                } else {
                    sinceArg = `${timeWindow}.days.ago`;
                }
                files = await this.gitService.getHistoricalFiles(workspacePath, sinceArg);
            }
        } else {
            // Non-Git: use filesystem mtime fallback
            const cutoffDate = timeWindow === "pending"
                ? new Date(Date.now() - 24 * 60 * 60 * 1000)
                : this._parseCutoffDate(timeWindow);
            files = this.fileSystemService.getRecentFiles(workspacePath, cutoffDate);
        }

        // Filter ignored patterns
        if (this._ignoredPatterns.length > 0) {
            files = files.filter((f) => !this._matchesIgnored(f.relativePath));
        }

        // Read pinned files from config
        const pinnedPaths = nova.workspace.config.get("com.gingerbeardman.FreshFiles.pinnedFiles", "stringArray") || [];

        // Mark files that are pinned
        for (const file of files) {
            if (pinnedPaths.includes(file.relativePath)) {
                file.isPinned = true;
            }
        }

        // Add pinned files not in current file list (outside time window)
        const existingRelPaths = new Set(files.map((f) => f.relativePath));
        for (const pinnedPath of pinnedPaths) {
            if (!existingRelPaths.has(pinnedPath)) {
                const absolutePath = nova.path.join(workspacePath, pinnedPath);
                let mtime = null;
                let isDeleted = false;
                try {
                    const stat = nova.fs.stat(absolutePath);
                    if (stat) {
                        mtime = stat.mtime;
                    } else {
                        isDeleted = true;
                    }
                } catch (e) {
                    isDeleted = true;
                }
                files.push({
                    relativePath: pinnedPath,
                    absolutePath: absolutePath,
                    mtime: mtime || new Date(),
                    status: null,
                    isPinned: true,
                    isDeleted: isDeleted
                });
            }
        }

        // Separate pinned files from fresh files
        const pinnedFiles = files.filter((f) => f.isPinned);
        const freshFiles = files.filter((f) => !f.isPinned);

        // Build items from fresh files
        let freshItems;
        if (this._flat) {
            freshItems = this._buildFlatList(freshFiles);
        } else {
            freshItems = this._buildTree(freshFiles, workspacePath);
        }

        // Build pinned section if any pinned files exist
        if (pinnedFiles.length > 0) {
            const pinnedSection = new FileItem("Pinned", "__pinned_section__", true);
            pinnedSection._isPinnedSection = true;
            pinnedSection.relativePath = "";

            // Pinned files are always flat
            const pinnedItems = this._buildFlatList(pinnedFiles);
            for (const pItem of pinnedItems) {
                pItem.isPinned = true;
            }
            for (const pItem of pinnedItems) {
                pinnedSection.addChild(pItem);
            }

            this._rootItems = [pinnedSection, ...freshItems];
        } else {
            this._rootItems = freshItems;
        }
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

    _buildFlatList(files) {
        const items = files.map((file) => {
            const basename = nova.path.basename(file.relativePath);
            const fileItem = new FileItem(basename, file.absolutePath, false);
            fileItem.relativePath = file.relativePath;
            fileItem.mtime = file.mtime instanceof Date ? file.mtime : new Date(file.mtime);
            fileItem.status = file.status;
            fileItem.isDeleted = !!file.isDeleted;
            return fileItem;
        });
        return this._sortItems(items);
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
            fileItem.isDeleted = !!file.isDeleted;

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
            // Directories first (only in tree mode)
            if (!this._flat) {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
            }

            if (this._sortByName) {
                return a.name.localeCompare(b.name);
            }

            // By mtime descending (newest first)
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
