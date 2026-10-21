// Directories that churn often and should be skipped during scans / file watching
const DEFAULT_SKIP_DIRS = [
    ".git", ".svn", ".hg",
    "node_modules", "build", "dist", "out", "vendor", "Pods",
    ".nova", ".vscode", ".idea",
    "__pycache__", ".cache", "DerivedData"
];

// Build/scratch output; only skipped for non-Git workspaces, where it would otherwise
// trigger constant rescans (Git workspaces rely on git status instead)
const NON_GIT_SKIP_DIRS = ["tmp", "temp", "obj"];

// The walk is synchronous and blocks the extension, so stop after this long
const WALK_TIME_BUDGET_MS = 1000;

class FileSystemService {
    constructor() {
        this._defaultSkipDirs = new Set([...DEFAULT_SKIP_DIRS, ...NON_GIT_SKIP_DIRS]);
    }

    getRecentFiles(workspacePath, cutoffDate, maxFiles) {
        const results = [];
        this._maxFiles = maxFiles || 5000;
        this._dirCount = 0;
        this._deadline = Date.now() + WALK_TIME_BUDGET_MS;
        this.timedOut = false;
        this._walkDirectory(workspacePath, workspacePath, cutoffDate, results);
        return results;
    }

    _walkDirectory(dirPath, workspacePath, cutoffDate, results) {
        // Cap directory traversal to prevent hanging on huge trees
        if (this._dirCount > this._maxFiles || results.length >= this._maxFiles) return;
        if (Date.now() > this._deadline) {
            this.timedOut = true;
            return;
        }
        this._dirCount++;

        let entries;
        try {
            entries = nova.fs.listdir(dirPath);
        } catch (e) {
            return;
        }

        for (const entry of entries) {
            if (results.length >= this._maxFiles || this.timedOut) return;

            const fullPath = nova.path.join(dirPath, entry);

            let stat;
            try {
                stat = nova.fs.stat(fullPath);
            } catch (e) {
                continue;
            }
            if (!stat) continue;

            if (stat.isDirectory()) {
                if (this._defaultSkipDirs.has(entry)) continue;
                this._walkDirectory(fullPath, workspacePath, cutoffDate, results);
            } else if (stat.isFile()) {
                if (stat.mtime >= cutoffDate) {
                    let relativePath = fullPath.substring(workspacePath.length);
                    if (relativePath.startsWith("/")) relativePath = relativePath.substring(1);

                    results.push({
                        relativePath: relativePath,
                        absolutePath: fullPath,
                        mtime: stat.mtime,
                        status: null,
                        isDeleted: false
                    });
                }
            }
        }
    }
}

module.exports = FileSystemService;
module.exports.DEFAULT_SKIP_DIRS = DEFAULT_SKIP_DIRS;
module.exports.NON_GIT_SKIP_DIRS = NON_GIT_SKIP_DIRS;
