class GitService {
    constructor() {
        this._gitRoot = null;
        this._gitRootWorkspace = null;
        this.isGitRepo = true;
    }

    runProcess(command, args, cwd, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const process = new Process(command, { args, cwd });
            let stdout = "";
            let stderr = "";
            let didFinish = false;

            const timer = setTimeout(() => {
                if (!didFinish) {
                    didFinish = true;
                    process.terminate();
                    reject(new Error(`Process timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`));
                }
            }, timeoutMs);

            process.onStdout((line) => {
                stdout += line;
            });

            process.onStderr((line) => {
                stderr += line;
            });

            process.onDidExit((status) => {
                if (didFinish) return;
                didFinish = true;
                clearTimeout(timer);
                if (status === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(stderr.trim() || `Process exited with status ${status}`));
                }
            });

            try {
                process.start();
            } catch (err) {
                didFinish = true;
                clearTimeout(timer);
                reject(err);
            }
        });
    }

    async getGitRoot(workspacePath) {
        // Re-check if workspace changed
        if (this._gitRoot && this._gitRootWorkspace === workspacePath) {
            return this._gitRoot;
        }

        try {
            const output = await this.runProcess("/usr/bin/git", ["rev-parse", "--show-toplevel"], workspacePath);
            this._gitRoot = output.trim();
            this._gitRootWorkspace = workspacePath;
            this.isGitRepo = true;
            return this._gitRoot;
        } catch (err) {
            this._gitRoot = null;
            this._gitRootWorkspace = workspacePath;
            this.isGitRepo = false;
            return null;
        }
    }

    async getPendingFiles(workspacePath) {
        try {
            const gitRoot = await this.getGitRoot(workspacePath);
            if (!gitRoot) return [];

            const output = await this.runProcess("/usr/bin/git", ["status", "--porcelain", "-unormal"], workspacePath);
            if (!output.trim()) return [];

            const files = [];
            const lines = output.split("\n").filter((l) => l.length > 0);

            for (const line of lines) {
                const statusCode = line.substring(0, 2).trim();
                let filePath = line.substring(3);

                // Strip surrounding quotes (git quotes paths with spaces/special chars)
                if (filePath.startsWith('"') && filePath.endsWith('"')) {
                    filePath = filePath.slice(1, -1).replace(/\\"/g, '"');
                }

                // Skip empty paths
                if (!filePath) continue;

                // Handle renamed files (old -> new)
                const actualPath = filePath.includes(" -> ") ? filePath.split(" -> ")[1] : filePath;

                const absolutePath = nova.path.join(gitRoot, actualPath);
                const relativePath = this._relativeTo(absolutePath, workspacePath);

                // Detect deleted files
                const isDeleted = statusCode === "D" || statusCode === "DD";

                // Get mtime from filesystem
                let mtime = null;
                if (!isDeleted) {
                    try {
                        const stat = nova.fs.stat(absolutePath);
                        if (stat) {
                            mtime = stat.mtime;
                        }
                    } catch (e) {
                        // File may have been deleted
                    }
                }

                files.push({
                    relativePath: relativePath,
                    absolutePath: absolutePath,
                    mtime: mtime || new Date(),
                    status: statusCode,
                    isDeleted: isDeleted
                });
            }

            return files;
        } catch (err) {
            console.error("Failed to get pending files:", err.message);
            return [];
        }
    }

    async getHistoricalFiles(workspacePath, sinceArg) {
        try {
            const gitRoot = await this.getGitRoot(workspacePath);
            if (!gitRoot) return [];

            const output = await this.runProcess(
                "/usr/bin/git",
                ["log", `--since=${sinceArg}`, "--max-count=1000", "--name-status", "--format=%aI", "--diff-filter=ACDMR"],
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

                    // Strip surrounding quotes
                    if (filePath.startsWith('"') && filePath.endsWith('"')) {
                        filePath = filePath.slice(1, -1).replace(/\\"/g, '"');
                    }

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
                            status: status,
                            isDeleted: status === "D"
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

    async getFileHistory(workspacePath, filePath) {
        try {
            const gitRoot = await this.getGitRoot(workspacePath);
            if (!gitRoot) return [];

            const relativePath = this._relativeTo(filePath, gitRoot);

            const output = await this.runProcess(
                "/usr/bin/git",
                ["log", "--format=%H%x09%aI%x09%s", "--follow", "-20", "--", relativePath],
                workspacePath
            );
            if (!output.trim()) return [];

            const commits = [];
            const lines = output.split("\n").filter((l) => l.trim().length > 0);

            for (const line of lines) {
                const parts = line.split("\t");
                if (parts.length >= 3) {
                    commits.push({
                        hash: parts[0],
                        date: new Date(parts[1]),
                        message: parts.slice(2).join("\t")
                    });
                }
            }

            return commits;
        } catch (err) {
            console.error("Failed to get file history:", err.message);
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

    async getAllTrackedFiles(workspacePath) {
        try {
            const gitRoot = await this.getGitRoot(workspacePath);
            if (!gitRoot) return [];

            const output = await this.runProcess(
                "/usr/bin/git",
                ["ls-files", "--full-name"],
                gitRoot
            );
            if (!output.trim()) return [];

            const files = [];
            const lines = output.split("\n").filter((l) => l.length > 0);

            for (const filePath of lines) {
                const absolutePath = nova.path.join(gitRoot, filePath);
                const relativePath = this._relativeTo(absolutePath, workspacePath);

                let mtime = null;
                try {
                    const stat = nova.fs.stat(absolutePath);
                    if (stat) {
                        mtime = stat.mtime;
                    }
                } catch (e) {
                    // File may not exist on disk
                }

                files.push({
                    relativePath: relativePath,
                    absolutePath: absolutePath,
                    mtime: mtime || new Date(),
                    status: null,
                    isDeleted: false
                });
            }

            return files;
        } catch (err) {
            console.error("Failed to get all tracked files:", err.message);
            return [];
        }
    }

    async getDeletedFileContent(workspacePath, relativePath, isPending) {
        try {
            const gitRoot = await this.getGitRoot(workspacePath);
            if (!gitRoot) return null;

            const relToRoot = this._relativeTo(
                nova.path.join(workspacePath, relativePath),
                gitRoot
            );

            if (isPending) {
                // Pending delete: file still exists at HEAD
                return await this.runProcess(
                    "/usr/bin/git",
                    ["show", `HEAD:${relToRoot}`],
                    gitRoot
                );
            } else {
                // Historical delete: find the commit that deleted it, then show from its parent
                const hashOutput = await this.runProcess(
                    "/usr/bin/git",
                    ["log", "--diff-filter=D", "-1", "--format=%H", "--", relToRoot],
                    gitRoot
                );
                const hash = hashOutput.trim();
                if (!hash) return null;

                return await this.runProcess(
                    "/usr/bin/git",
                    ["show", `${hash}~1:${relToRoot}`],
                    gitRoot
                );
            }
        } catch (err) {
            console.error("Failed to get deleted file content:", err.message);
            return null;
        }
    }

    async restoreDeletedFilePending(workspacePath, relativePath) {
        try {
            const gitRoot = await this.getGitRoot(workspacePath);
            if (!gitRoot) return false;

            const relToRoot = this._relativeTo(
                nova.path.join(workspacePath, relativePath),
                gitRoot
            );

            await this.runProcess(
                "/usr/bin/git",
                ["checkout", "HEAD", "--", relToRoot],
                gitRoot
            );
            return true;
        } catch (err) {
            console.error("Failed to restore deleted file:", err.message);
            return false;
        }
    }

    async pickaxeSearch(workspacePath, searchString, filePath) {
        try {
            const gitRoot = await this.getGitRoot(workspacePath);
            if (!gitRoot) return [];

            const args = ["log", `-S${searchString}`, "--format=%H%x09%aI%x09%s", "-20"];
            if (filePath) {
                const relToRoot = this._relativeTo(filePath, gitRoot);
                args.push("--", relToRoot);
            }

            const output = await this.runProcess("/usr/bin/git", args, gitRoot);
            if (!output.trim()) return [];

            const commits = [];
            const lines = output.split("\n").filter((l) => l.trim().length > 0);

            for (const line of lines) {
                const parts = line.split("\t");
                if (parts.length >= 3) {
                    commits.push({
                        hash: parts[0],
                        date: new Date(parts[1]),
                        message: parts.slice(2).join("\t")
                    });
                }
            }

            return commits;
        } catch (err) {
            console.error("Failed to run pickaxe search:", err.message);
            return [];
        }
    }

    async getPickaxeDiff(workspacePath, commitHash, searchString) {
        try {
            const output = await this.runProcess(
                "/usr/bin/git",
                ["diff", `${commitHash}~1`, commitHash, `-S${searchString}`],
                workspacePath
            );
            return output;
        } catch (err) {
            console.error("Failed to get pickaxe diff:", err.message);
            return null;
        }
    }

    async getLineHistory(workspacePath, filePath, startLine, endLine) {
        try {
            const gitRoot = await this.getGitRoot(workspacePath);
            if (!gitRoot) return null;

            const relToRoot = this._relativeTo(filePath, gitRoot);

            const output = await this.runProcess(
                "/usr/bin/git",
                ["log", "-n", "20", `-L${startLine},${endLine}:${relToRoot}`],
                gitRoot
            );
            return output;
        } catch (err) {
            console.error("Failed to get line history:", err.message);
            return null;
        }
    }

    clearCache() {
        this._gitRoot = null;
        this._gitRootWorkspace = null;
    }
}

module.exports = GitService;
