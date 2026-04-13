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
        
        this.initializeElements();
        this.attachEventListeners();
        this.loadStoredToken();
    }

    initializeElements() {
        this.elements = {
            patToken: document.getElementById('pat-token'),
            saveToken: document.getElementById('save-token'),
            repoOwner: document.getElementById('repo-owner'),
            repoName: document.getElementById('repo-name'),
            branch: document.getElementById('branch'),
            loadRepo: document.getElementById('load-repo'),
            fileTree: document.getElementById('file-tree'),
            refreshFiles: document.getElementById('refresh-files'),
            editor: document.getElementById('editor'),
            currentFile: document.getElementById('current-file'),
            fileInfo: document.getElementById('file-info'),
            newFile: document.getElementById('new-file'),
            saveFile: document.getElementById('save-file'),
            deleteFile: document.getElementById('delete-file'),
            commitMessage: document.getElementById('commit-message'),
            commitPush: document.getElementById('commit-push'),
            status: document.getElementById('status'),
            importFile: document.getElementById('import-file'),
            importFolder: document.getElementById('import-folder'),
            exportFile: document.getElementById('export-file'),
            exportFolder: document.getElementById('export-folder'),
            fileInput: document.getElementById('file-input'),
            folderInput: document.getElementById('folder-input'),
            runWorkflow: document.getElementById('run-workflow'),
            workflowModal: document.getElementById('workflow-modal'),
            workflowRef: document.getElementById('workflow-ref'),
            workflowInputs: document.getElementById('workflow-inputs'),
            cancelWorkflow: document.getElementById('cancel-workflow'),
            confirmWorkflow: document.getElementById('confirm-workflow')
        };
    }

    attachEventListeners() {
        this.elements.saveToken.addEventListener('click', () => this.saveToken());
        this.elements.loadRepo.addEventListener('click', () => this.loadRepository());
        this.elements.refreshFiles.addEventListener('click', () => this.loadRepository());
        this.elements.newFile.addEventListener('click', () => this.createNewFile());
        this.elements.saveFile.addEventListener('click', () => this.saveCurrentFile());
        this.elements.deleteFile.addEventListener('click', () => this.deleteCurrentFile());
        this.elements.commitPush.addEventListener('click', () => this.commitAndPush());
        this.elements.editor.addEventListener('input', () => this.onEditorChange());
        
        // Import/Export
        this.elements.importFile.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.importFolder.addEventListener('click', () => this.elements.folderInput.click());
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileImport(e));
        this.elements.folderInput.addEventListener('change', (e) => this.handleFolderImport(e));
        this.elements.exportFile.addEventListener('click', () => this.exportCurrentFile());
        this.elements.exportFolder.addEventListener('click', () => this.exportAllFiles());
        
        // Workflow
        this.elements.runWorkflow.addEventListener('click', () => this.showWorkflowModal());
        this.elements.cancelWorkflow.addEventListener('click', () => this.hideWorkflowModal());
        this.elements.confirmWorkflow.addEventListener('click', () => this.triggerWorkflow());
    }

    loadStoredToken() {
        if (this.token) {
            this.elements.patToken.value = this.token;
            this.showStatus('Token loaded from storage', 'info');
        }
    }

    saveToken() {
        this.token = this.elements.patToken.value.trim();
        if (this.token) {
            localStorage.setItem('github_pat', this.token);
            this.showStatus('Token saved successfully', 'success');
        } else {
            this.showStatus('Please enter a valid token', 'error');
        }
    }

    // Proper UTF-8 Base64 decoding (handles emojis)
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

    // Proper UTF-8 Base64 encoding (handles emojis)
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
            this.showStatus('Repository loaded successfully', 'success');
            this.elements.commitPush.disabled = false;
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
            'js': '📜',
            'ts': '📘',
            'json': '📋',
            'html': '🌐',
            'css': '🎨',
            'md': '📝',
            'yml': '⚙️',
            'yaml': '⚙️',
            'py': '🐍',
            'rb': '💎',
            'go': '🔵',
            'rs': '🦀',
            'java': '☕',
            'php': '🐘',
            'sh': '💻',
            'txt': '📄',
            'svg': '🖼️',
            'png': '🖼️',
            'jpg': '🖼️',
            'gif': '🖼️'
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
            
            // Handle binary files
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
            this.elements.exportFile.disabled = false;
            
            // Show/hide workflow button
            this.updateWorkflowButton(path);
            
            // Highlight active file
            document.querySelectorAll('.file-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.path === path) {
                    item.classList.add('active');
                }
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

    updateWorkflowButton(path) {
        const isWorkflow = path.match(/^\.github\/workflows\/.*\.(yml|yaml)$/i);
        this.elements.runWorkflow.style.display = isWorkflow ? 'inline-block' : 'none';
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
        this.elements.exportFile.disabled = false;
        this.updateWorkflowButton(fileName);
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
            
            await this.loadRepository();
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
            this.elements.exportFile.disabled = true;
            this.elements.runWorkflow.style.display = 'none';
            
            this.showStatus('File deleted successfully', 'success');
            await this.loadRepository();
        } catch (error) {
            this.showStatus(`Error deleting file: ${error.message}`, 'error');
        }
    }

    // Import file(s)
    async handleFileImport(event) {
        const files = event.target.files;
        if (!files.length) return;

        for (const file of files) {
            await this.importSingleFile(file, file.name);
        }
        
        event.target.value = '';
        this.showStatus(`${files.length} file(s) imported. Save each file to push to repository.`, 'success');
    }

    // Import folder
    async handleFolderImport(event) {
        const files = event.target.files;
        if (!files.length) return;

        for (const file of files) {
            const path = file.webkitRelativePath || file.name;
            await this.importSingleFile(file, path);
        }
        
        event.target.value = '';
        this.showStatus(`${files.length} file(s) imported from folder. Save each file to push to repository.`, 'success');
    }

    async importSingleFile(file, path) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                this.pendingUploads[path] = content;
                this.fileContents[path] = content;
                
                // If this is the first file, show it in editor
                if (Object.keys(this.pendingUploads).length === 1) {
                    this.currentFile = path;
                    this.elements.editor.value = content;
                    this.elements.currentFile.textContent = path + ' (imported)';
                    this.elements.fileInfo.textContent = 'Imported - not saved';
                    this.elements.saveFile.disabled = false;
                    this.elements.exportFile.disabled = false;
                    this.updateWorkflowButton(path);
                }
                
                resolve();
            };
            reader.readAsText(file);
        });
    }

    // Export current file
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

    // Export all files
    async exportAllFiles() {
        if (!this.owner || !this.repo) {
            this.showStatus('Please load a repository first', 'error');
            return;
        }

        this.showStatus('Preparing export...', 'info');

        try {
            // Get all file paths
            const filePaths = this.getAllFilePaths(this.files);
            
            if (filePaths.length === 0) {
                this.showStatus('No files to export', 'error');
                return;
            }

            // Create a simple ZIP-like structure using a single download with file structure
            // For simplicity, we'll download as a JSON manifest with all contents
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

            // Download as JSON
            this.downloadFile(
                `${this.repo}-export.json`,
                JSON.stringify(exportData, null, 2)
            );

            this.showStatus(`Exported ${Object.keys(exportData.files).length} files`, 'success');
        } catch (error) {
            this.showStatus(`Export failed: ${error.message}`, 'error');
        }
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

    // Workflow functions
    async showWorkflowModal() {
        if (!this.currentFile) return;

        this.elements.workflowRef.value = this.branch;
        this.elements.workflowInputs.innerHTML = '';

        // Try to parse workflow file for inputs
        try {
            const content = this.elements.editor.value;
            const workflowInputs = this.parseWorkflowInputs(content);
            
            if (workflowInputs.length > 0) {
                const inputsHeader = document.createElement('h4');
                inputsHeader.textContent = 'Workflow Inputs';
                inputsHeader.style.color = '#8b949e';
                inputsHeader.style.marginBottom = '10px';
                this.elements.workflowInputs.appendChild(inputsHeader);

                workflowInputs.forEach(input => {
                    const div = document.createElement('div');
                    div.className = 'workflow-input-group';
                    div.innerHTML = `
                        <label>${input.name}${input.required ? ' *' : ''}</label>
                        <input type="text" 
                               data-input-name="${input.name}" 
                               placeholder="${input.default || ''}"
                               value="${input.default || ''}">
                        ${input.description ? `<small>${input.description}</small>` : ''}
                    `;
                    this.elements.workflowInputs.appendChild(div);
                });
            }
        } catch (e) {
            console.error('Failed to parse workflow inputs:', e);
        }

        this.elements.workflowModal.classList.add('active');
    }

    parseWorkflowInputs(yamlContent) {
        const inputs = [];
        
        // Simple YAML parsing for workflow_dispatch inputs
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

    hideWorkflowModal() {
        this.elements.workflowModal.classList.remove('active');
    }

    async triggerWorkflow() {
        if (!this.currentFile) return;

        const workflowFile = this.currentFile.split('/').pop();
        const ref = this.elements.workflowRef.value.trim() || this.branch;

        // Collect inputs
        const inputs = {};
        this.elements.workflowInputs.querySelectorAll('input[data-input-name]').forEach(input => {
            const name = input.dataset.inputName;
            const value = input.value.trim();
            if (value) {
                inputs[name] = value;
            }
        });

        try {
            this.showStatus('Triggering workflow...', 'info');

            const url = `https://api.github.com/repos/${this.owner}/${this.repo}/actions/workflows/${workflowFile}/dispatches`;
            
            const body = {
                ref: ref
            };

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

            this.hideWorkflowModal();
            this.showStatus('Workflow triggered successfully! Check Actions tab on GitHub.', 'success');
            
            // Open GitHub Actions page
            const actionsUrl = `https://github.com/${this.owner}/${this.repo}/actions`;
            if (confirm('Workflow triggered! Open GitHub Actions page?')) {
                window.open(actionsUrl, '_blank');
            }
        } catch (error) {
            this.showStatus(`Failed to trigger workflow: ${error.message}`, 'error');
        }
    }

    async commitAndPush() {
        const pendingCount = Object.keys(this.pendingUploads).length;
        if (pendingCount === 0) {
            this.showStatus('No pending changes. Use "Save File" to save individual files.', 'info');
            return;
        }

        const message = this.elements.commitMessage.value.trim() || 'Update files';
        
        if (!confirm(`Commit ${pendingCount} file(s) with message: "${message}"?`)) {
            return;
        }

        try {
            this.showStatus(`Committing ${pendingCount} files...`, 'info');
            
            let saved = 0;
            for (const [path, content] of Object.entries(this.pendingUploads)) {
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
                    this.showStatus(`Saving... ${saved}/${pendingCount}`, 'info');
                }
            }

            this.showStatus(`Successfully committed ${saved} files!`, 'success');
            await this.loadRepository();
        } catch (error) {
            this.showStatus(`Error committing files: ${error.message}`, 'error');
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

// Initialize the editor when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GitHubEditor();
});