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
            status: document.getElementById('status')
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
        Object.keys(level).sort().forEach(key => {
            const item = level[key];
            const fullPath = prefix ? `${prefix}/${key}` : key;

            if (item.path) {
                // It's a file
                const fileDiv = document.createElement('div');
                fileDiv.className = 'file-item';
                fileDiv.textContent = `📄 ${key}`;
                fileDiv.onclick = () => this.loadFile(item.path, item.sha);
                container.appendChild(fileDiv);
            } else {
                // It's a folder
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
            }
        });
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
            const content = atob(data.content);
            
            this.currentFile = path;
            this.fileContents[path] = content;
            this.fileSHAs[path] = data.sha;
            
            this.elements.editor.value = content;
            this.elements.currentFile.textContent = path;
            this.elements.fileInfo.textContent = `Size: ${data.size} bytes | SHA: ${data.sha.substring(0, 7)}`;
            
            this.elements.saveFile.disabled = false;
            this.elements.deleteFile.disabled = false;
            
            // Highlight active file
            document.querySelectorAll('.file-item').forEach(item => {
                item.classList.remove('active');
                if (item.textContent.includes(path.split('/').pop())) {
                    item.classList.add('active');
                }
            });
            
            this.showStatus('File loaded successfully', 'success');
        } catch (error) {
            this.showStatus(`Error loading file: ${error.message}`, 'error');
        }
    }

    createNewFile() {
        const fileName = prompt('Enter file name (with path if needed):');
        if (!fileName) return;

        this.currentFile = fileName;
        this.fileContents[fileName] = '';
        this.elements.editor.value = '';
        this.elements.currentFile.textContent = fileName + ' (new)';
        this.elements.fileInfo.textContent = 'New file - not saved';
        this.elements.saveFile.disabled = false;
        this.elements.deleteFile.disabled = true;
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
                content: btoa(unescape(encodeURIComponent(content))),
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
            
            this.showStatus('File saved successfully', 'success');
            this.elements.fileInfo.textContent = `Saved | SHA: ${data.content.sha.substring(0, 7)}`;
            
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
            
            this.showStatus('File deleted successfully', 'success');
            await this.loadRepository();
        } catch (error) {
            this.showStatus(`Error deleting file: ${error.message}`, 'error');
        }
    }

    async commitAndPush() {
        const message = this.elements.commitMessage.value.trim();
        if (!message) {
            this.showStatus('Please enter a commit message', 'error');
            return;
        }

        this.showStatus('This feature saves files individually. Use "Save File" to commit changes.', 'info');
    }

    showStatus(message, type) {
        this.elements.status.textContent = message;
        this.elements.status.className = `status ${type}`;
        
        setTimeout(() => {
            this.elements.status.style.display = 'none';
        }, 3000);
    }
}

// Initialize the editor when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GitHubEditor();
});
