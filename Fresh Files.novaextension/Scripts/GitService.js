class GitService {
    constructor() {
        this._gitRoot = null;
    }

    runProcess(command, args, cwd) {
        return new Promise((resolve, reject) => {
            const process = new Process(command, { args, cwd });
            let stdout = "";
            let stderr = "";

            process.onStdout((line) => {
                stdout += line;
            });

            process.onStderr((line) => {
                stderr += line;
            });

            process.onDidExit((status) => {
                if (status === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(stderr.trim() || `Process exited with status ${status}`));
                }
            });

            try {
                process.start();
            } catch (err) {
                reject(err);
            }
        });
    }

    async getGitRoot(workspacePath) {
        if (this._gitRoot) return this._gitRoot;

        try {
            const output = await this.runProcess("/usr/bin/git", ["rev-parse", "--show-toplevel"], workspacePath);
            this._gitRoot = output.trim();
            return this._gitRoot;
        } catch (err) {
            console.error("Failed to get git root:", err.message);
            return null;
        }
    }

    async getPendingFiles(workspacePath) {
        try {
            const gitRoot = await this.getGitRoot(workspacePath);
            if (!gitRoot) return [];

            const output = await this.runProcess("/usr/bin/git", ["status", "--porcelain", "-uall"], workspacePath);
            if (!output.trim()) return [];

            const files = [];
            const lines = output.split("\n").filter((l) => l.length > 0);

            for (const line of lines) {
                const statusCode = line.substring(0, 2).trim();
                const filePath = line.substring(3);

                // Skip empty paths
                if (!filePath) continue;

                // Handle renamed files (old -> new)
                const actualPath = filePath.includes(" -> ") ? filePath.split(" -> ")[1] : filePath;

                const absolutePath = nova.path.join(gitRoot, actualPath);
                const relativePath = this._relativeTo(absolutePath, workspacePath);

                // Get mtime from filesystem
                let mtime = null;
                try {
                    const stat = nova.fs.stat(absolutePath);
                    if (stat) {
                        mtime = stat.mtime;
                    }
                } catch (e) {
                    // File may have been deleted
                }

                // Skip deleted files we can't stat
                if (!mtime && (statusCode === "D" || statusCode === "DD")) continue;

                files.push({
                    relativePath: relativePath,
                    absolutePath: absolutePath,
                    mtime: mtime || new Date(),
                    status: statusCode
                });
            }

            return files;
        } catch (err) {
            console.error("Failed to get pending files:", err.message);
            return [];
        }
    }

    async getHistoricalFiles(workspacePath, days) {
        try {
            const gitRoot = await this.getGitRoot(workspacePath);
            if (!gitRoot) return [];

            const output = await this.runProcess(
                "/usr/bin/git",
                ["log", `--since=${days}.days.ago`, "--name-status", "--format=%aI", "--diff-filter=ACDMR"],
                workspacePath
            );
            if (!output.trim()) return [];

            const fileMap = new Map();
            let currentDate = null;
            const lines = output.split("\n");

            for (const line of lines) {
                if (!line.trim()) continue;

                // ISO date line from --format="%aI"
                if (line.match(/^\d{4}-\d{2}-\d{2}T/)) {
                    currentDate = new Date(line.trim());
                    continue;
                }

                // File status line (e.g., "M\tpath/to/file")
                const match = line.match(/^([ACDMR])\d*\t(.+)$/);
                if (match && currentDate) {
                    const status = match[1];
                    let filePath = match[2];

                    // Handle renames: "R\told\tnew"
                    if (filePath.includes("\t")) {
                        filePath = filePath.split("\t").pop();
                    }

                    const absolutePath = nova.path.join(gitRoot, filePath);
                    const relativePath = this._relativeTo(absolutePath, workspacePath);

                    // Only keep the most recent date for each file
                    if (!fileMap.has(relativePath)) {
                        fileMap.set(relativePath, {
                            relativePath: relativePath,
                            absolutePath: absolutePath,
                            mtime: currentDate,
                            status: status
                        });
                    }
                }
            }

            return Array.from(fileMap.values());
        } catch (err) {
            console.error("Failed to get historical files:", err.message);
            return [];
        }
    }

    _relativeTo(absolutePath, workspacePath) {
        if (absolutePath.startsWith(workspacePath)) {
            let rel = absolutePath.substring(workspacePath.length);
            if (rel.startsWith("/")) rel = rel.substring(1);
            return rel;
        }
        return absolutePath;
    }

    clearCache() {
        this._gitRoot = null;
    }
}

module.exports = GitService;
