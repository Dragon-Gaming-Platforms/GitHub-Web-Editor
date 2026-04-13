class GitHubEditor {
    constructor() {
        this.token = localStorage.getItem('github_pat') || '';
        this.owner = '';
        this.repo = '';
        this.branch = 'main';
        this.currentFile = null;
        this.files = {};
        this.fileContents = {};
        this.fileSHAs = {};
        this.pendingUploads = {};
        this.workflows = [];
        
        this.initializeElements();
        this.attachEventListeners();
        this.loadStoredSettings();
    }

    initializeElements() {
        this.elements = {
            // Navigation
            navBtns: document.querySelectorAll('.nav-btn'),
            tabContents: document.querySelectorAll('.tab-content'),
            
            // Settings
            patToken: document.getElementById('pat-token'),
            saveToken: document.getElementById('save-token'),
            repoOwner: document.getElementById('repo-owner'),
            repoName: document.getElementById('repo-name'),
            branch: document.getElementById('branch'),
            loadRepo: document.getElementById('load-repo'),
            fontSize: document.getElementById('font-size'),
            tabSize: document.getElementById('tab-size'),
            wordWrap: document.getElementById('word-wrap'),
            
            // Code Editor
            fileTree: document.getElementById('file-tree'),
            refreshFiles: document.getElementById('refresh-files'),
            editor: document.getElementById('editor'),
            currentFile: document.getElementById('current-file'),
            fileInfo: document.getElementById('file-info'),
            newFile: document.getElementById('new-file'),
            saveFile: document.getElementById('save-file'),
            deleteFile: document.getElementById('delete-file'),
            
            // Import/Export
            importFile: document.getElementById('import-file'),
            importFolder: document.getElementById('import-folder'),
            exportCurrent: document.getElementById('export-current'),
            exportAll: document.getElementById('export-all'),
            exportZip: document.getElementById('export-zip'),
            fileInput: document.getElementById('file-input'),
            folderInput: document.getElementById('folder-input'),
            pendingImports: document.getElementById('pending-imports'),
            batchCommitMessage: document.getElementById('batch-commit-message'),
            batchCommitBtn: document.getElementById('batch-commit-btn'),
            
            // GitHub Pages
            refreshPages: document.getElementById('refresh-pages'),
            pagesStatus: document.getElementById('pages-status'),
            pagesBranch: document.getElementById('pages-branch'),
            pagesPath: document.getElementById('pages-path'),
            enablePages: document.getElementById('enable-pages'),
            disablePages: document.getElementById('disable-pages'),
            deploymentsList: document.getElementById('deployments-list'),
            pagesUrl: document.getElementById('pages-url'),
            pagesSettingsUrl: document.getElementById('pages-settings-url'),
            repoUrl: document.getElementById('repo-url'),
            
            // Actions
            refreshActions: document.getElementById('refresh-actions'),
            workflowsList: document.getElementById('workflows-list'),
            workflowSelect: document.getElementById('workflow-select'),
            workflowRef: document.getElementById('workflow-ref'),
            workflowInputsContainer: document.getElementById('workflow-inputs-container'),
            triggerWorkflow: document.getElementById('trigger-workflow'),
            workflowRuns: document.getElementById('workflow-runs'),
            
            // Status
            status: document.getElementById('status')
        };
    }

    attachEventListeners() {
        // Navigation
        this.elements.navBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Settings
        this.elements.saveToken.addEventListener('click', () => this.saveToken());
        this.elements.loadRepo.addEventListener('click', () => this.loadRepository());
        this.elements.fontSize.addEventListener('change', () => this.updateEditorSettings());
        this.elements.tabSize.addEventListener('change', () => this.updateEditorSettings());
        this.elements.wordWrap.addEventListener('change', () => this.updateEditorSettings());

        // Code Editor
        this.elements.refreshFiles.addEventListener('click', () => this.loadRepository());
        this.elements.newFile.addEventListener('click', () => this.createNewFile());
        this.elements.saveFile.addEventListener('click', () => this.saveCurrentFile());
        this.elements.deleteFile.addEventListener('click', () => this.deleteCurrentFile());
        this.elements.editor.addEventListener('input', () => this.onEditorChange());

        // Import/Export
        this.elements.importFile.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.importFolder.addEventListener('click', () => this.elements.folderInput.click());
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileImport(e));
        this.elements.folderInput.addEventListener('change', (e) => this.handleFolderImport(e));
        this.elements.exportCurrent.addEventListener('click', () => this.exportCurrentFile());
        this.elements.exportAll.addEventListener('click', () => this.exportAllFiles());
        this.elements.exportZip.addEventListener('click', () => this.downloadRepoZip());
        this.elements.batchCommitBtn.addEventListener('click', () => this.batchCommit());

        // GitHub Pages
        this.elements.refreshPages.addEventListener('click', () => this.loadPagesInfo());
        this.elements.enablePages.addEventListener('click', () => this.enablePages());
        this.elements.disablePages.addEventListener('click', () => this.disablePages());

        // Actions
        this.elements.refreshActions.addEventListener('click', () => this.loadActionsInfo());
        this.elements.workflowSelect.addEventListener('change', () => this.onWorkflowSelect());
        this.elements.triggerWorkflow.addEventListener('click', () => this.triggerWorkflow());
    }

    loadStoredSettings() {
        if (this.token) {
            this.elements.patToken.value = this.token;
        }

        const settings = JSON.parse(localStorage.getItem('editor_settings') || '{}');
        if (settings.fontSize) this.elements.fontSize.value = settings.fontSize;
        if (settings.tabSize) this.elements.tabSize.value = settings.tabSize;
        if (settings.wordWrap !== undefined) this.elements.wordWrap.checked = settings.wordWrap;

        this.updateEditorSettings();
    }

    updateEditorSettings() {
        const fontSize = this.elements.fontSize.value;
        const tabSize = this.elements.tabSize.value;
        const wordWrap = this.elements.wordWrap.checked;

        this.elements.editor.style.fontSize = `${fontSize}px`;
        this.elements.editor.style.tabSize = tabSize;
        this.elements.editor.style.whiteSpace = wordWrap ? 'pre-wrap' : 'pre';

        localStorage.setItem('editor_settings', JSON.stringify({
            fontSize, tabSize, wordWrap
        }));
    }

    // Navigation
    switchTab(tabId) {
        this.elements.navBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        this.elements.tabContents.forEach(tab => {
            tab.classList.toggle('active', tab.id === `tab-${tabId}`);
        });
    }

    // Token Management
    saveToken() {
        this.token = this.elements.patToken.value.trim();
        if (this.token) {
            localStorage.setItem('github_pat', this.token);
            this.showStatus('Token saved successfully', 'success');
        } else {
            this.showStatus('Please enter a valid token', 'error');
        }
    }

    // Base64 Encoding/Decoding with UTF-8 support
    decodeBase64(base64) {
        try {
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return new TextDecoder('utf-8').decode(bytes);
        } catch (e) {
            console.error('Decode error:', e);
            return atob(base64);
        }
    }

    encodeBase64(text) {
        try {
            const bytes = new TextEncoder().encode(text);
            let binaryString = '';
            for (let i = 0; i < bytes.length; i++) {
                binaryString += String.fromCharCode(bytes[i]);
            }
            return btoa(binaryString);
        } catch (e) {
            console.error('Encode error:', e);
            return btoa(unescape(encodeURIComponent(text)));
        }
    }

    // Repository Loading
    async loadRepository() {
        this.owner = this.elements.repoOwner.value.trim();
        this.repo = this.elements.repoName.value.trim();
        this.branch = this.elements.branch.value.trim() || 'main';

        if (!this.token || !this.owner || !this.repo) {
            this.showStatus('Please provide token, owner, and repository name', 'error');
            return;
        }

        this.showStatus('Loading repository...', 'info');

        try {
            await this.fetchRepositoryTree();
            await this.loadBranches();
            this.updateQuickLinks();
            this.showStatus('Repository loaded successfully', 'success');
            
            // Switch to code tab
            this.switchTab('code');
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
        }
    }

    async fetchRepositoryTree() {
        const url = `https://api.github.com/repos/${this.owner}/${this.repo}/git/trees/${this.branch}?recursive=1`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${this.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch repository: ${response.statusText}`);
        }

        const data = await response.json();
        this.files = this.organizeFiles(data.tree);
        this.renderFileTree();
    }

    async loadBranches() {
        try {
            const url = `https://api.github.com/repos/${this.owner}/${this.repo}/branches`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const branches = await response.json();
                this.elements.pagesBranch.innerHTML = '<option value="">Select branch</option>';
                branches.forEach(branch => {
                    const option = document.createElement('option');
                    option.value = branch.name;
                    option.textContent = branch.name;
                    this.elements.pagesBranch.appendChild(option);
                });
            }
        } catch (e) {
            console.error('Failed to load branches:', e);
        }
    }

    updateQuickLinks() {
        const repoBase = `https://github.com/${this.owner}/${this.repo}`;
        
        this.elements.repoUrl.href = repoBase;
        this.elements.repoUrl.classList.remove('disabled');
        
        this.elements.pagesSettingsUrl.href = `${repoBase}/settings/pages`;
        this.elements.pagesSettingsUrl.classList.remove('disabled');
    }

    organizeFiles(tree) {
        const organized = {};
        
        tree.forEach(item => {
            if (item.type === 'blob') {
                const parts = item.path.split('/');
                let current = organized;
                
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!current[parts[i]]) {
                        current[parts[i]] = {};
                    }
                    current = current[parts[i]];
                }
                
                current[parts[parts.length - 1]] = {
                    path: item.path,
                    sha: item.sha,
                    size: item.size
                };
            }
        });
        
        return organized;
    }

    renderFileTree() {
        this.elements.fileTree.innerHTML = '';
        this.renderTreeLevel(this.files, this.elements.fileTree, '');
    }

    renderTreeLevel(level, container, prefix) {
        const folders = [];
        const files = [];
        
        Object.keys(level).forEach(key => {
            if (level[key].path) {
                files.push(key);
            } else {
                folders.push(key);
            }
        });

        folders.sort().forEach(key => {
            const item = level[key];
            const fullPath = prefix ? `${prefix}/${key}` : key;
            
            const folderDiv = document.createElement('div');
            folderDiv.className = 'folder-item';
            folderDiv.textContent = `📁 ${key}`;
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'folder-content';
            contentDiv.style.display = 'none';
            
            folderDiv.onclick = (e) => {
                e.stopPropagation();
                const isHidden = contentDiv.style.display === 'none';
                contentDiv.style.display = isHidden ? 'block' : 'none';
                folderDiv.textContent = `${isHidden ? '📂' : '📁'} ${key}`;
            };
            
            container.appendChild(folderDiv);
            container.appendChild(contentDiv);
            this.renderTreeLevel(item, contentDiv, fullPath);
        });

        files.sort().forEach(key => {
            const item = level[key];
            const fileDiv = document.createElement('div');
            fileDiv.className = 'file-item';
            fileDiv.dataset.path = item.path;
            
            const icon = this.getFileIcon(key);
            fileDiv.textContent = `${icon} ${key}`;
            fileDiv.onclick = () => this.loadFile(item.path, item.sha);
            container.appendChild(fileDiv);
        });
    }

    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const icons = {
            'js': '📜', 'ts': '📘', 'json': '📋', 'html': '🌐',
            'css': '🎨', 'md': '📝', 'yml': '⚙️', 'yaml': '⚙️',
            'py': '🐍', 'rb': '💎', 'go': '🔵', 'rs': '🦀',
            'java': '☕', 'php': '🐘', 'sh': '💻', 'txt': '📄',
            'svg': '🖼️', 'png': '🖼️', 'jpg': '🖼️', 'gif': '🖼️'
        };
        return icons[ext] || '📄';
    }

    async loadFile(path, sha) {
        try {
            this.showStatus('Loading file...', 'info');
            
            const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`;
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to load file: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (this.isBinaryFile(path)) {
                this.elements.editor.value = `[Binary file - ${data.size} bytes]\n\nBase64 content:\n${data.content}`;
                this.elements.editor.disabled = true;
            } else {
                const content = this.decodeBase64(data.content.replace(/\n/g, ''));
                this.elements.editor.value = content;
                this.elements.editor.disabled = false;
                this.fileContents[path] = content;
            }
            
            this.currentFile = path;
            this.fileSHAs[path] = data.sha;
            
            this.elements.currentFile.textContent = path;
            this.elements.fileInfo.textContent = `Size: ${data.size} bytes | SHA: ${data.sha.substring(0, 7)}`;
            
            this.elements.saveFile.disabled = false;
            this.elements.deleteFile.disabled = false;
            this.elements.exportCurrent.disabled = false;
            
            document.querySelectorAll('.file-item').forEach(item => {
                item.classList.toggle('active', item.dataset.path === path);
            });
            
            this.showStatus('File loaded successfully', 'success');
        } catch (error) {
            this.showStatus(`Error loading file: ${error.message}`, 'error');
        }
    }

    isBinaryFile(path) {
        const binaryExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp',
            'pdf', 'zip', 'tar', 'gz', 'exe', 'dll', 'so',
            'woff', 'woff2', 'ttf', 'eot', 'mp3', 'mp4',
            'wav', 'avi', 'mov', 'webm'];
        const ext = path.split('.').pop().toLowerCase();
        return binaryExtensions.includes(ext);
    }

    createNewFile() {
        const fileName = prompt('Enter file name (with path if needed):');
        if (!fileName) return;

        this.currentFile = fileName;
        this.fileContents[fileName] = '';
        this.pendingUploads[fileName] = '';
        this.elements.editor.value = '';
        this.elements.editor.disabled = false;
        this.elements.currentFile.textContent = fileName + ' (new)';
        this.elements.fileInfo.textContent = 'New file - not saved';
        this.elements.saveFile.disabled = false;
        this.elements.deleteFile.disabled = true;
        this.elements.exportCurrent.disabled = false;
        this.updatePendingList();
    }

    onEditorChange() {
        if (this.currentFile) {
            this.elements.fileInfo.textContent = 'Modified - not saved';
        }
    }

    async saveCurrentFile() {
        if (!this.currentFile) {
            this.showStatus('No file selected', 'error');
            return;
        }

        const content = this.elements.editor.value;
        const message = prompt('Enter commit message:', `Update ${this.currentFile}`);
        
        if (!message) return;

        try {
            this.showStatus('Saving file...', 'info');
            
            const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.currentFile}`;
            
            const body = {
                message: message,
                content: this.encodeBase64(content),
                branch: this.branch
            };

            if (this.fileSHAs[this.currentFile]) {
                body.sha = this.fileSHAs[this.currentFile];
            }

            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || response.statusText);
            }

            const data = await response.json();
            this.fileSHAs[this.currentFile] = data.content.sha;
            this.fileContents[this.currentFile] = content;
            delete this.pendingUploads[this.currentFile];
            
            this.showStatus('File saved successfully', 'success');
            this.elements.fileInfo.textContent = `Saved | SHA: ${data.content.sha.substring(0, 7)}`;
            this.elements.currentFile.textContent = this.currentFile;
            this.updatePendingList();
            
            await this.fetchRepositoryTree();
        } catch (error) {
            this.showStatus(`Error saving file: ${error.message}`, 'error');
        }
    }

    async deleteCurrentFile() {
        if (!this.currentFile || !this.fileSHAs[this.currentFile]) {
            this.showStatus('Cannot delete unsaved file', 'error');
            return;
        }

        if (!confirm(`Are you sure you want to delete ${this.currentFile}?`)) {
            return;
        }

        const message = prompt('Enter commit message:', `Delete ${this.currentFile}`);
        if (!message) return;

        try {
            this.showStatus('Deleting file...', 'info');
            
            const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.currentFile}`;
            
            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    sha: this.fileSHAs[this.currentFile],
                    branch: this.branch
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to delete file: ${response.statusText}`);
            }

            delete this.fileContents[this.currentFile];
            delete this.fileSHAs[this.currentFile];
            
            this.currentFile = null;
            this.elements.editor.value = '';
            this.elements.currentFile.textContent = 'No file selected';
            this.elements.fileInfo.textContent = '';
            this.elements.saveFile.disabled = true;
            this.elements.deleteFile.disabled = true;
            this.elements.exportCurrent.disabled = true;
            
            this.showStatus('File deleted successfully', 'success');
            await this.fetchRepositoryTree();
        } catch (error) {
            this.showStatus(`Error deleting file: ${error.message}`, 'error');
        }
    }

    // Import/Export Functions
    async handleFileImport(event) {
        const files = event.target.files;
        if (!files.length) return;

        for (const file of files) {
            await this.importSingleFile(file, file.name);
        }
        
        event.target.value = '';
        this.updatePendingList();
        this.showStatus(`${files.length} file(s) imported`, 'success');
    }

    async handleFolderImport(event) {
        const files = event.target.files;
        if (!files.length) return;

        for (const file of files) {
            const path = file.webkitRelativePath || file.name;
            await this.importSingleFile(file, path);
        }
        
        event.target.value = '';
        this.updatePendingList();
        this.showStatus(`${files.length} file(s) imported from folder`, 'success');
    }

    async importSingleFile(file, path) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                this.pendingUploads[path] = content;
                this.fileContents[path] = content;
                resolve();
            };
            reader.readAsText(file);
        });
    }

    updatePendingList() {
        const pendingPaths = Object.keys(this.pendingUploads);
        
        if (pendingPaths.length === 0) {
            this.elements.pendingImports.innerHTML = '';
            this.elements.batchCommitBtn.disabled = true;
            return;
        }

        this.elements.batchCommitBtn.disabled = false;
        this.elements.pendingImports.innerHTML = `
            <h4 style="margin-bottom: 10px; color: #8b949e;">Pending Files (${pendingPaths.length})</h4>
            ${pendingPaths.map(path => `
                <div class="pending-item">
                    <span>${path}</span>
                    <button class="remove-btn" onclick="editor.removePending('${path}')">✕</button>
                </div>
            `).join('')}
        `;
    }

    removePending(path) {
        delete this.pendingUploads[path];
        this.updatePendingList();
    }

    exportCurrentFile() {
        if (!this.currentFile) {
            this.showStatus('No file selected', 'error');
            return;
        }

        const content = this.elements.editor.value;
        const filename = this.currentFile.split('/').pop();
        this.downloadFile(filename, content);
        this.showStatus(`Exported ${filename}`, 'success');
    }

    async exportAllFiles() {
        if (!this.owner || !this.repo) {
            this.showStatus('Please load a repository first', 'error');
            return;
        }

        this.showStatus('Preparing export...', 'info');

        try {
            const filePaths = this.getAllFilePaths(this.files);
            
            if (filePaths.length === 0) {
                this.showStatus('No files to export', 'error');
                return;
            }

            const exportData = {
                repository: `${this.owner}/${this.repo}`,
                branch: this.branch,
                exportDate: new Date().toISOString(),
                files: {}
            };

            let loaded = 0;
            for (const path of filePaths) {
                try {
                    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`;
                    const response = await fetch(url, {
                        headers: {
                            'Authorization': `token ${this.token}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (!this.isBinaryFile(path)) {
                            const content = this.decodeBase64(data.content.replace(/\n/g, ''));
                            exportData.files[path] = content;
                        } else {
                            exportData.files[path] = `[Binary: ${data.content}]`;
                        }
                    }
                    loaded++;
                    this.showStatus(`Exporting... ${loaded}/${filePaths.length}`, 'info');
                } catch (e) {
                    console.error(`Failed to export ${path}:`, e);
                }
            }

            this.downloadFile(
                `${this.repo}-export.json`,
                JSON.stringify(exportData, null, 2)
            );

            this.showStatus(`Exported ${Object.keys(exportData.files).length} files`, 'success');
        } catch (error) {
            this.showStatus(`Export failed: ${error.message}`, 'error');
        }
    }

    async downloadRepoZip() {
        if (!this.owner || !this.repo) {
            this.showStatus('Please load a repository first', 'error');
            return;
        }

        const zipUrl = `https://github.com/${this.owner}/${this.repo}/archive/refs/heads/${this.branch}.zip`;
        window.open(zipUrl, '_blank');
        this.showStatus('Downloading ZIP archive...', 'success');
    }

    getAllFilePaths(level, prefix = '') {
        let paths = [];
        Object.keys(level).forEach(key => {
            const item = level[key];
            const fullPath = prefix ? `${prefix}/${key}` : key;
            if (item.path) {
                paths.push(item.path);
            } else {
                paths = paths.concat(this.getAllFilePaths(item, fullPath));
            }
        });
        return paths;
    }

    downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async batchCommit() {
        const pendingPaths = Object.keys(this.pendingUploads);
        if (pendingPaths.length === 0) {
            this.showStatus('No pending files to commit', 'error');
            return;
        }

        const message = this.elements.batchCommitMessage.value.trim() || 'Add imported files';

        if (!confirm(`Commit ${pendingPaths.length} file(s) with message: "${message}"?`)) {
            return;
        }

        try {
            let saved = 0;
            for (const [path, content] of Object.entries(this.pendingUploads)) {
                this.showStatus(`Committing... ${saved + 1}/${pendingPaths.length}`, 'info');
                
                const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`;
                
                const body = {
                    message: `${message} - ${path}`,
                    content: this.encodeBase64(content),
                    branch: this.branch
                };

                if (this.fileSHAs[path]) {
                    body.sha = this.fileSHAs[path];
                }

                const response = await fetch(url, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });

                if (response.ok) {
                    const data = await response.json();
                    this.fileSHAs[path] = data.content.sha;
                    delete this.pendingUploads[path];
                    saved++;
                }
            }

            this.updatePendingList();
            this.showStatus(`Successfully committed ${saved} files!`, 'success');
            await this.fetchRepositoryTree();
        } catch (error) {
            this.showStatus(`Error committing files: ${error.message}`, 'error');
        }
    }

    // GitHub Pages Functions
    async loadPagesInfo() {
        if (!this.owner || !this.repo) {
            this.showStatus('Please load a repository first', 'error');
            return;
        }

        this.showStatus('Loading Pages info...', 'info');

        try {
            // Get Pages info
            const pagesUrl = `https://api.github.com/repos/${this.owner}/${this.repo}/pages`;
            const pagesResponse = await fetch(pagesUrl, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (pagesResponse.ok) {
                const pagesData = await pagesResponse.json();
                this.displayPagesStatus(pagesData);
            } else if (pagesResponse.status === 404) {
                this.elements.pagesStatus.innerHTML = `
                    <div class="status-row">
                        <span class="status-label">Status</span>
                        <span class="status-value inactive">Not Enabled</span>
                    </div>
                `;
                this.elements.pagesUrl.classList.add('disabled');
            }

            // Get deployments
            await this.loadDeployments();

            this.showStatus('Pages info loaded', 'success');
        } catch (error) {
            this.showStatus(`Error loading Pages info: ${error.message}`, 'error');
        }
    }

    displayPagesStatus(data) {
        this.elements.pagesStatus.innerHTML = `
            <div class="status-row">
                <span class="status-label">Status</span>
                <span class="status-value ${data.status === 'built' ? 'active' : ''}">${data.status || 'Unknown'}</span>
            </div>
            <div class="status-row">
                <span class="status-label">URL</span>
                <span class="status-value"><a href="${data.html_url}" target="_blank" style="color: #58a6ff;">${data.html_url}</a></span>
            </div>
            <div class="status-row">
                <span class="status-label">Source</span>
                <span class="status-value">${data.source?.branch || 'N/A'} / ${data.source?.path || '/'}</span>
            </div>
            <div class="status-row">
                <span class="status-label">HTTPS</span>
                <span class="status-value">${data.https_enforced ? 'Enforced' : 'Not enforced'}</span>
            </div>
        `;

        if (data.html_url) {
            this.elements.pagesUrl.href = data.html_url;
            this.elements.pagesUrl.classList.remove('disabled');
        }

        if (data.source) {
            this.elements.pagesBranch.value = data.source.branch;
            this.elements.pagesPath.value = data.source.path;
        }
    }

    async loadDeployments() {
        try {
            const url = `https://api.github.com/repos/${this.owner}/${this.repo}/deployments`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const deployments = await response.json();
                
                if (deployments.length === 0) {
                    this.elements.deploymentsList.innerHTML = '<p class="muted">No deployments found</p>';
                    return;
                }

                this.elements.deploymentsList.innerHTML = deployments.slice(0, 5).map(dep => `
                    <div class="deployment-item">
                        <div class="deployment-header">
                            <span class="deployment-env">${dep.environment}</span>
                            <span class="deployment-status">${new Date(dep.created_at).toLocaleDateString()}</span>
                        </div>
                        <div class="deployment-url">
                            Ref: ${dep.ref}
                        </div>
                    </div>
                `).join('');
            }
        } catch (e) {
            console.error('Failed to load deployments:', e);
        }
    }

    async enablePages() {
        const branch = this.elements.pagesBranch.value;
        const path = this.elements.pagesPath.value;

        if (!branch) {
            this.showStatus('Please select a branch', 'error');
            return;
        }

        try {
            this.showStatus('Enabling GitHub Pages...', 'info');

            const url = `https://api.github.com/repos/${this.owner}/${this.repo}/pages`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    source: {
                        branch: branch,
                        path: path
                    }
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || response.statusText);
            }

            this.showStatus('GitHub Pages enabled successfully!', 'success');
            await this.loadPagesInfo();
        } catch (error) {
            this.showStatus(`Error enabling Pages: ${error.message}`, 'error');
        }
    }

    async disablePages() {
        if (!confirm('Are you sure you want to disable GitHub Pages?')) {
            return;
        }

        try {
            this.showStatus('Disabling GitHub Pages...', 'info');

            const url = `https://api.github.com/repos/${this.owner}/${this.repo}/pages`;
            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok && response.status !== 204) {
                throw new Error('Failed to disable Pages');
            }

            this.showStatus('GitHub Pages disabled', 'success');
            await this.loadPagesInfo();
        } catch (error) {
            this.showStatus(`Error disabling Pages: ${error.message}`, 'error');
        }
    }

    // GitHub Actions Functions
    async loadActionsInfo() {
        if (!this.owner || !this.repo) {
            this.showStatus('Please load a repository first', 'error');
            return;
        }

        this.showStatus('Loading Actions info...', 'info');

        try {
            // Get workflows
            const workflowsUrl = `https://api.github.com/repos/${this.owner}/${this.repo}/actions/workflows`;
            const workflowsResponse = await fetch(workflowsUrl, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (workflowsResponse.ok) {
                const data = await workflowsResponse.json();
                this.workflows = data.workflows || [];
                this.displayWorkflows();
            }

            // Get recent runs
            await this.loadWorkflowRuns();

            this.showStatus('Actions info loaded', 'success');
        } catch (error) {
            this.showStatus(`Error loading Actions info: ${error.message}`, 'error');
        }
    }

    displayWorkflows() {
        if (this.workflows.length === 0) {
            this.elements.workflowsList.innerHTML = '<p class="muted">No workflows found</p>';
            this.elements.workflowSelect.innerHTML = '<option value="">No workflows available</option>';
            return;
        }

        this.elements.workflowsList.innerHTML = this.workflows.map(wf => `
            <div class="workflow-item">
                <div>
                    <div class="workflow-name">${wf.name}</div>
                    <div class="workflow-path">${wf.path}</div>
                </div>
                <span class="run-status ${wf.state}">${wf.state}</span>
            </div>
        `).join('');

        this.elements.workflowSelect.innerHTML = '<option value="">Select a workflow</option>' +
            this.workflows.map(wf => `<option value="${wf.id}" data-path="${wf.path}">${wf.name}</option>`).join('');
    }

    async loadWorkflowRuns() {
        try {
            const url = `https://api.github.com/repos/${this.owner}/${this.repo}/actions/runs?per_page=10`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                const runs = data.workflow_runs || [];

                if (runs.length === 0) {
                    this.elements.workflowRuns.innerHTML = '<p class="muted">No recent runs</p>';
                    return;
                }

                this.elements.workflowRuns.innerHTML = runs.map(run => `
                    <div class="run-item">
                        <div>
                            <div class="run-name">${run.name}</div>
                            <div class="workflow-path">${run.head_branch} • ${new Date(run.created_at).toLocaleDateString()}</div>
                        </div>
                        <span class="run-status ${run.conclusion || run.status}">${run.conclusion || run.status}</span>
                    </div>
                `).join('');
            }
        } catch (e) {
            console.error('Failed to load workflow runs:', e);
        }
    }

    async onWorkflowSelect() {
        const workflowId = this.elements.workflowSelect.value;
        this.elements.triggerWorkflow.disabled = !workflowId;
        this.elements.workflowInputsContainer.innerHTML = '';

        if (!workflowId) return;

        // Try to load workflow file and parse inputs
        const selectedOption = this.elements.workflowSelect.selectedOptions[0];
        const workflowPath = selectedOption.dataset.path;

        if (workflowPath) {
            try {
                const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${workflowPath}?ref=${this.branch}`;
                const response = await fetch(url, {
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    const content = this.decodeBase64(data.content.replace(/\n/g, ''));
                    const inputs = this.parseWorkflowInputs(content);

                    if (inputs.length > 0) {
                        this.elements.workflowInputsContainer.innerHTML = `
                            <h4 style="margin-bottom: 10px; color: #8b949e;">Workflow Inputs</h4>
                            ${inputs.map(input => `
                                <div class="workflow-input-group">
                                    <label>${input.name}${input.required ? ' *' : ''}</label>
                                    <input type="text" 
                                           data-input-name="${input.name}" 
                                           placeholder="${input.default || ''}"
                                           value="${input.default || ''}">
                                    ${input.description ? `<small>${input.description}</small>` : ''}
                                </div>
                            `).join('')}
                        `;
                    }
                }
            } catch (e) {
                console.error('Failed to load workflow inputs:', e);
            }
        }
    }

    parseWorkflowInputs(yamlContent) {
        const inputs = [];
        
        const workflowDispatchMatch = yamlContent.match(/workflow_dispatch:\s*\n([\s\S]*?)(?=\n\s*\w+:|$)/);
        if (!workflowDispatchMatch) return inputs;

        const inputsMatch = workflowDispatchMatch[1].match(/inputs:\s*\n([\s\S]*?)(?=\n\s{2}\w+:|$)/);
        if (!inputsMatch) return inputs;

        const inputsSection = inputsMatch[1];
        const inputRegex = /(\w+):\s*\n([\s\S]*?)(?=\n\s{6}\w+:|\n\s{4}\w+:|$)/g;
        
        let match;
        while ((match = inputRegex.exec(inputsSection)) !== null) {
            const inputName = match[1];
            const inputDetails = match[2];
            
            const descMatch = inputDetails.match(/description:\s*['"]?([^'"\n]+)['"]?/);
            const requiredMatch = inputDetails.match(/required:\s*(true|false)/);
            const defaultMatch = inputDetails.match(/default:\s*['"]?([^'"\n]+)['"]?/);
            
            inputs.push({
                name: inputName,
                description: descMatch ? descMatch[1] : '',
                required: requiredMatch ? requiredMatch[1] === 'true' : false,
                default: defaultMatch ? defaultMatch[1] : ''
            });
        }

        return inputs;
    }

    async triggerWorkflow() {
        const workflowId = this.elements.workflowSelect.value;
        if (!workflowId) return;

        const ref = this.elements.workflowRef.value.trim() || this.branch;

        // Collect inputs
        const inputs = {};
        this.elements.workflowInputsContainer.querySelectorAll('input[data-input-name]').forEach(input => {
            const name = input.dataset.inputName;
            const value = input.value.trim();
            if (value) {
                inputs[name] = value;
            }
        });

        try {
            this.showStatus('Triggering workflow...', 'info');

            const url = `https://api.github.com/repos/${this.owner}/${this.repo}/actions/workflows/${workflowId}/dispatches`;
            
            const body = { ref };
            if (Object.keys(inputs).length > 0) {
                body.inputs = inputs;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || response.statusText);
            }

            this.showStatus('Workflow triggered successfully!', 'success');
            
            const actionsUrl = `https://github.com/${this.owner}/${this.repo}/actions`;
            if (confirm('Workflow triggered! Open GitHub Actions page?')) {
                window.open(actionsUrl, '_blank');
            }

            // Refresh runs after a delay
            setTimeout(() => this.loadWorkflowRuns(), 3000);
        } catch (error) {
            this.showStatus(`Failed to trigger workflow: ${error.message}`, 'error');
        }
    }

    showStatus(message, type) {
        this.elements.status.textContent = message;
        this.elements.status.className = `status ${type}`;
        
        if (type !== 'info') {
            setTimeout(() => {
                this.elements.status.className = 'status';
            }, 4000);
        }
    }
}

// Initialize
let editor;
document.addEventListener('DOMContentLoaded', () => {
    editor = new GitHubEditor();
});