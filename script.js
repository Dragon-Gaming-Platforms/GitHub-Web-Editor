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
            // Auth
            patToken: document.getElementById('pat-token'),
            repoOwner: document.getElementById('repo-owner'),
            repoName: document.getElementById('repo-name'),
            branch: document.getElementById('branch'),
            loadRepo: document.getElementById('load-repo'),
            
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
            
            // Settings
            fontSize: document.getElementById('font-size'),
            tabSize: document.getElementById('tab-size'),
            wordWrap: document.getElementById('word-wrap'),
            
            // Status
            status: document.getElementById('status')
        };
    }

    attachEventListeners() {
        // Tab Navigation - Fixed!
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = e.currentTarget.dataset.tab;
                this.switchTab(tabId);
            });
        });

        // Repository
        this.elements.loadRepo.addEventListener('click', () => this.loadRepository());

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

        // Settings
        this.elements.fontSize.addEventListener('change', () => this.updateEditorSettings());
        this.elements.tabSize.addEventListener('change', () => this.updateEditorSettings());
        this.elements.wordWrap.addEventListener('change', () => this.updateEditorSettings());

        // Save token on input change
        this.elements.patToken.addEventListener('change', () => {
            this.token = this.elements.patToken.value.trim();
            if (this.token) {
                localStorage.setItem('github_pat', this.token);
            }
        });
    }

    loadStoredSettings() {
        // Load PAT
        if (this.token) {
            this.elements.patToken.value = this.token;
        }

        // Load editor settings
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

        localStorage.setItem('editor_settings', JSON.stringify({ fontSize, tabSize, wordWrap }));
    }

    // Tab Navigation
    switchTab(tabId) {
        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            if (btn.dataset.tab === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(tab => {
            if (tab.id === `tab-${tabId}`) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
    }

    // Base64 with UTF-8 support
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

    // Repository
    async loadRepository() {
        this.token = this.elements.patToken.value.trim();
        this.owner = this.elements.repoOwner.value.trim();
        this.repo = this.elements.repoName.value.trim();
        this.branch = this.elements.branch.value.trim() || 'main';

        if (!this.token) {
            this.showStatus('Please enter your Personal Access Token', 'error');
            return;
        }

        if (!this.owner || !this.repo) {
            this.showStatus('Please enter owner and repository name', 'error');
            return;
        }

        // Save token
        localStorage.setItem('github_pat', this.token);

        this.showStatus('Loading repository...', 'info');

        try {
            await this.fetchRepositoryTree();
            await this.loadBranches();
            this.updateQuickLinks();
            this.showStatus('Repository loaded successfully', 'success');
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
            
            folderDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = contentDiv.style.display === 'none';
                contentDiv.style.display = isHidden ? 'block' : 'none';
                folderDiv.textContent = `${isHidden ? '📂' : '📁'} ${key}`;
            });
            
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
            
            fileDiv.addEventListener('click', () => this.loadFile(item.path, item.sha));
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
                this.elements.editor.value = `[Binary file - ${data.size} bytes]`;
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
            
            this.showStatus('File loaded', 'success');
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
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
        const message = prompt('Commit message:', `Update ${this.currentFile}`);
        
        if (!message) return;

        try {
            this.showStatus('Saving...', 'info');
            
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
            
            this.showStatus('File saved!', 'success');
            this.elements.fileInfo.textContent = `Saved | SHA: ${data.content.sha.substring(0, 7)}`;
            this.elements.currentFile.textContent = this.currentFile;
            this.updatePendingList();
            
            await this.fetchRepositoryTree();
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
        }
    }

    async deleteCurrentFile() {
        if (!this.currentFile || !this.fileSHAs[this.currentFile]) {
            this.showStatus('Cannot delete unsaved file', 'error');
            return;
        }

        if (!confirm(`Delete ${this.currentFile}?`)) return;

        const message = prompt('Commit message:', `Delete ${this.currentFile}`);
        if (!message) return;

        try {
            this.showStatus('Deleting...', 'info');
            
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
                throw new Error(`Failed to delete: ${response.statusText}`);
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
            
            this.showStatus('File deleted', 'success');
            await this.fetchRepositoryTree();
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
        }
    }

    // Import/Export
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
        this.showStatus(`${files.length} file(s) imported`, 'success');
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
            <h4>Pending Files (${pendingPaths.length})</h4>
            ${pendingPaths.map(path => `
                <div class="pending-item">
                    <span>${path}</span>
                    <button class="remove-btn" data-path="${path}">✕</button>
                </div>
            `).join('')}
        `;

        // Add remove handlers
        this.elements.pendingImports.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                delete this.pendingUploads[btn.dataset.path];
                this.updatePendingList();
            });
        });
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
            this.showStatus('Load a repository first', 'error');
            return;
        }

        this.showStatus('Exporting...', 'info');

        try {
            const filePaths = this.getAllFilePaths(this.files);
            
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
                            exportData.files[path] = this.decodeBase64(data.content.replace(/\n/g, ''));
                        }
                    }
                    loaded++;
                    this.showStatus(`Exporting ${loaded}/${filePaths.length}...`, 'info');
                } catch (e) {
                    console.error(`Failed to export ${path}:`, e);
                }
            }

            this.downloadFile(`${this.repo}-export.json`, JSON.stringify(exportData, null, 2));
            this.showStatus(`Exported ${Object.keys(exportData.files).length} files`, 'success');
        } catch (error) {
            this.showStatus(`Export failed: ${error.message}`, 'error');
        }
    }

    downloadRepoZip() {
        if (!this.owner || !this.repo) {
            this.showStatus('Load a repository first', 'error');
            return;
        }

        window.open(`https://github.com/${this.owner}/${this.repo}/archive/refs/heads/${this.branch}.zip`, '_blank');
        this.showStatus('Downloading ZIP...', 'success');
    }

    getAllFilePaths(level, prefix = '') {
        let paths = [];
        Object.keys(level).forEach(key => {
            const item = level[key];
            if (item.path) {
                paths.push(item.path);
            } else {
                paths = paths.concat(this.getAllFilePaths(item, prefix ? `${prefix}/${key}` : key));
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
        if (pendingPaths.length === 0) return;

        const message = this.elements.batchCommitMessage.value.trim() || 'Add files';

        if (!confirm(`Commit ${pendingPaths.length} file(s)?`)) return;

        try {
            let saved = 0;
            for (const [path, content] of Object.entries(this.pendingUploads)) {
                this.showStatus(`Committing ${saved + 1}/${pendingPaths.length}...`, 'info');
                
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
            this.showStatus(`Committed ${saved} files!`, 'success');
            await this.fetchRepositoryTree();
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
        }
    }

    // GitHub Pages
    async loadPagesInfo() {
        if (!this.owner || !this.repo) {
            this.showStatus('Load a repository first', 'error');
            return;
        }

        this.showStatus('Loading Pages info...', 'info');

        try {
            const response = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}/pages`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayPagesStatus(data);
            } else if (response.status === 404) {
                this.elements.pagesStatus.innerHTML = `
                    <div class="status-row">
                        <span class="status-label">Status</span>
                        <span class="status-value inactive">Not Enabled</span>
                    </div>
                `;
                this.elements.pagesUrl.classList.add('disabled');
            }

            await this.loadDeployments();
            this.showStatus('Pages info loaded', 'success');
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
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
                <span class="status-value"><a href="${data.html_url}" target="_blank">${data.html_url}</a></span>
            </div>
            <div class="status-row">
                <span class="status-label">Source</span>
                <span class="status-value">${data.source?.branch || 'N/A'} / ${data.source?.path || '/'}</span>
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
            const response = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}/deployments`, {
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
                        <div>
                            <span class="workflow-name">${dep.environment}</span>
                            <div class="workflow-path">${dep.ref} • ${new Date(dep.created_at).toLocaleDateString()}</div>
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
            this.showStatus('Select a branch', 'error');
            return;
        }

        try {
            this.showStatus('Enabling Pages...', 'info');

            const response = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}/pages`, {
                method: 'POST',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ source: { branch, path } })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || response.statusText);
            }

            this.showStatus('Pages enabled!', 'success');
            await this.loadPagesInfo();
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
        }
    }

    async disablePages() {
        if (!confirm('Disable GitHub Pages?')) return;

        try {
            this.showStatus('Disabling Pages...', 'info');

            const response = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}/pages`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok && response.status !== 204) {
                throw new Error('Failed to disable Pages');
            }

            this.showStatus('Pages disabled', 'success');
            await this.loadPagesInfo();
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
        }
    }

    // GitHub Actions
    async loadActionsInfo() {
        if (!this.owner || !this.repo) {
            this.showStatus('Load a repository first', 'error');
            return;
        }

        this.showStatus('Loading Actions...', 'info');

        try {
            const response = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}/actions/workflows`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.workflows = data.workflows || [];
                this.displayWorkflows();
            }

            await this.loadWorkflowRuns();
            this.showStatus('Actions loaded', 'success');
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
        }
    }

    displayWorkflows() {
        if (this.workflows.length === 0) {
            this.elements.workflowsList.innerHTML = '<p class="muted">No workflows found</p>';
            this.elements.workflowSelect.innerHTML = '<option value="">No workflows</option>';
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

        this.elements.workflowSelect.innerHTML = '<option value="">Select workflow</option>' +
            this.workflows.map(wf => `<option value="${wf.id}" data-path="${wf.path}">${wf.name}</option>`).join('');
    }

    async loadWorkflowRuns() {
        try {
            const response = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}/actions/runs?per_page=10`, {
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
            console.error('Failed to load runs:', e);
        }
    }

    async onWorkflowSelect() {
        const workflowId = this.elements.workflowSelect.value;
        this.elements.triggerWorkflow.disabled = !workflowId;
        this.elements.workflowInputsContainer.innerHTML = '';

        if (!workflowId) return;

        const selectedOption = this.elements.workflowSelect.selectedOptions[0];
        const workflowPath = selectedOption.dataset.path;

        if (workflowPath) {
            try {
                const response = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}/contents/${workflowPath}?ref=${this.branch}`, {
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
                            <h4>Workflow Inputs</h4>
                            ${inputs.map(input => `
                                <div class="workflow-input-group">
                                    <label>${input.name}${input.required ? ' *' : ''}</label>
                                    <input type="text" data-input-name="${input.name}" 
                                           placeholder="${input.default || ''}" value="${input.default || ''}">
                                    ${input.description ? `<small>${input.description}</small>` : ''}
                                </div>
                            `).join('')}
                        `;
                    }
                }
            } catch (e) {
                console.error('Failed to load workflow:', e);
            }
        }
    }

    parseWorkflowInputs(yamlContent) {
        const inputs = [];
        const match = yamlContent.match(/workflow_dispatch:\s*\n([\s\S]*?)(?=\n\s*\w+:|$)/);
        if (!match) return inputs;

        const inputsMatch = match[1].match(/inputs:\s*\n([\s\S]*?)(?=\n\s{2}\w+:|$)/);
        if (!inputsMatch) return inputs;

        const inputRegex = /(\w+):\s*\n([\s\S]*?)(?=\n\s{6}\w+:|\n\s{4}\w+:|$)/g;
        let m;
        while ((m = inputRegex.exec(inputsMatch[1])) !== null) {
            const descMatch = m[2].match(/description:\s*['"]?([^'"\n]+)['"]?/);
            const requiredMatch = m[2].match(/required:\s*(true|false)/);
            const defaultMatch = m[2].match(/default:\s*['"]?([^'"\n]+)['"]?/);
            
            inputs.push({
                name: m[1],
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

        const inputs = {};
        this.elements.workflowInputsContainer.querySelectorAll('input[data-input-name]').forEach(input => {
            if (input.value.trim()) {
                inputs[input.dataset.inputName] = input.value.trim();
            }
        });

        try {
            this.showStatus('Triggering workflow...', 'info');

            const body = { ref };
            if (Object.keys(inputs).length > 0) body.inputs = inputs;

            const response = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}/actions/workflows/${workflowId}/dispatches`, {
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

            this.showStatus('Workflow triggered!', 'success');
            
            if (confirm('Open Actions page?')) {
                window.open(`https://github.com/${this.owner}/${this.repo}/actions`, '_blank');
            }

            setTimeout(() => this.loadWorkflowRuns(), 3000);
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
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
document.addEventListener('DOMContentLoaded', () => {
    window.editor = new GitHubEditor();
});