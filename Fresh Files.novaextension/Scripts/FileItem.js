class FileItem {
    constructor(name, path, isDirectory) {
        this.name = name;
        this.path = path;
        this.relativePath = "";
        this.isDirectory = isDirectory;
        this.children = [];
        this.parent = null;
        this.mtime = null;
        this.status = null;
        this.isPinned = false;
        this.isDeleted = false;
    }

    addChild(child) {
        child.parent = this;
        this.children.push(child);
    }

    // Cached values are set by the data provider once the tree is fully built
    get fileCount() {
        if (!this.isDirectory) return 0;
        if (this._fileCount !== undefined) return this._fileCount;
        let count = 0;
        for (const child of this.children) {
            if (child.isDirectory) {
                count += child.fileCount;
            } else {
                count++;
            }
        }
        return count;
    }

    get newestMtime() {
        if (!this.isDirectory) return this.mtime;
        if (this._newestMtime !== undefined) return this._newestMtime;
        let newest = null;
        for (const child of this.children) {
            const childTime = child.isDirectory ? child.newestMtime : child.mtime;
            if (childTime && (!newest || childTime > newest)) {
                newest = childTime;
            }
        }
        return newest;
    }
}

module.exports = FileItem;
