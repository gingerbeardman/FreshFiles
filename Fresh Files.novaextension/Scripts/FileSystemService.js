class FileSystemService {
    constructor() {
        this._defaultSkipDirs = new Set([
            ".git", ".svn", ".hg",
            "node_modules", "build", "dist", "out", "vendor", "Pods",
            ".nova", ".vscode", ".idea",
            "__pycache__", ".cache", "DerivedData"
        ]);
    }

    getRecentFiles(workspacePath, cutoffDate, maxFiles) {
        const results = [];
        this._maxFiles = maxFiles || 5000;
        this._dirCount = 0;
        this._walkDirectory(workspacePath, workspacePath, cutoffDate, results);
        return results;
    }

    _walkDirectory(dirPath, workspacePath, cutoffDate, results) {
        // Cap directory traversal to prevent hanging on huge trees
        if (this._dirCount > this._maxFiles || results.length >= this._maxFiles) return;
        this._dirCount++;

        let entries;
        try {
            entries = nova.fs.listdir(dirPath);
        } catch (e) {
            return;
        }

        for (const entry of entries) {
            if (results.length >= this._maxFiles) return;

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
