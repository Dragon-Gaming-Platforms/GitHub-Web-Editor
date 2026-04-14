// ─── Codespace Workflow Templates ─────────────────────────────────────────────

const CODESPACE_START_WORKFLOW = `name: Start Codespace
on:
  workflow_dispatch:
    inputs:
      codespace_name:
        description: 'Codespace name to start (leave blank for newest)'
        required: false
        default: ''

jobs:
  start-codespace:
    runs-on: ubuntu-latest
    steps:
      - name: Start Codespace
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          if [ -z "\${{ github.event.inputs.codespace_name }}" ]; then
            CODESPACE=$(gh api /user/codespaces --jq '.codespaces | map(select(.repository.full_name == "\${{ github.repository }}")) | sort_by(.last_used_at) | last | .name')
          else
            CODESPACE="\${{ github.event.inputs.codespace_name }}"
          fi
          echo "Starting codespace: $CODESPACE"
          gh api --method POST /user/codespaces/$CODESPACE/start
          echo "Codespace started successfully"
`;

const CODESPACE_STOP_WORKFLOW = `name: Stop Codespace
on:
  workflow_dispatch:
    inputs:
      codespace_name:
        description: 'Codespace name to stop (leave blank for newest)'
        required: false
        default: ''

jobs:
  stop-codespace:
    runs-on: ubuntu-latest
    steps:
      - name: Stop Codespace
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          if [ -z "\${{ github.event.inputs.codespace_name }}" ]; then
            CODESPACE=$(gh api /user/codespaces --jq '.codespaces | map(select(.repository.full_name == "\${{ github.repository }}")) | sort_by(.last_used_at) | last | .name')
          else
            CODESPACE="\${{ github.event.inputs.codespace_name }}"
          fi
          echo "Stopping codespace: $CODESPACE"
          gh api --method POST /user/codespaces/$CODESPACE/stop
          echo "Codespace stopped successfully"
`;

// ─── Main Editor Class ────────────────────────────────────────────────────────

class GitHubEditor {
    constructor() {
        this.token = localStorage.getItem('github_pat') || '';
        this.owner = '';
        this.repo = '';
        this.branch = 'main';
        this.currentFile = null;
        this.files = {};
        this.fileTree = [];
        this.fileContents = {};
        this.fileSHAs = {};
        this.pendingUploads = {};
        this.workflows = [];
        this.ymlFiles = [];
        this.branches = [];
        this.cacheKey = '';
        this._pollTimer = null;

        this.initializeElements();
        this.attachEventListeners();
        this.loadStoredSettings();
    }

    // ── Cache ──────────────────────────────────────────────────────────────────

    buildCacheKey() { return `ghcache_${this.owner}_${this.repo}_${this.branch}`; }

    saveEditsToCache() {
        if (!this.cacheKey) return;
        localStorage.setItem(this.cacheKey, JSON.stringify({
            owner: this.owner, repo: this.repo, branch: this.branch,
            timestamp: Date.now(), edits: this.pendingUploads, shas: this.fileSHAs
        }));
        this.updateCacheIndicator();
    }

    loadEditsFromCache() {
        if (!this.cacheKey) return;
        try {
            const raw = localStorage.getItem(this.cacheKey);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (data.edits) { this.pendingUploads = data.edits; this.fileContents = { ...this.fileContents, ...data.edits }; }
            if (data.shas)  { this.fileSHAs = { ...this.fileSHAs, ...data.shas }; }
            this.updatePendingList();
            this.updateCacheIndicator();
            const n = Object.keys(this.pendingUploads).length;
            if (n > 0) this.showStatus(`Restored ${n} cached edit(s)`, 'info');
        } catch (e) { console.error(e); }
    }

    clearRepoCache() {
        if (!this.cacheKey) return;
        localStorage.removeItem(this.cacheKey);
        this.pendingUploads = {};
        this.updatePendingList();
        this.updateCacheIndicator();
    }

    updateCacheIndicator() {
        const el = document.getElementById('cache-indicator');
        if (!el) return;
        const n = Object.keys(this.pendingUploads).length;
        el.textContent = n > 0 ? `💾 ${n} unsaved` : 'Cache clear';
        el.className = n > 0 ? 'cache-indicator has-edits' : 'cache-indicator';
    }

    // ── Init ───────────────────────────────────────────────────────────────────

    initializeElements() {
        const $ = id => document.getElementById(id);
        this.elements = {
            patToken: $('pat-token'), repoOwner: $('repo-owner'), repoName: $('repo-name'),
            branch: $('branch'), loadRepo: $('load-repo'),

            fileTree: $('file-tree'), refreshFiles: $('refresh-files'),
            editor: $('editor'), currentFile: $('current-file'), fileInfo: $('file-info'),
            newFile: $('new-file'), saveFile: $('save-file'), deleteFile: $('delete-file'),

            importFile: $('import-file'), importFolder: $('import-folder'),
            exportCurrent: $('export-current'), exportAll: $('export-all'), exportZip: $('export-zip'),
            fileInput: $('file-input'), folderInput: $('folder-input'),
            pendingImports: $('pending-imports'),
            batchCommitMessage: $('batch-commit-message'), batchCommitBtn: $('batch-commit-btn'),

            refreshPages: $('refresh-pages'), pagesStatus: $('pages-status'),
            pagesSourceType: $('pages-source-type'), branchSourceConfig: $('branch-source-config'),
            pagesBranch: $('pages-branch'), pagesPath: $('pages-path'),
            enablePages: $('enable-pages'), disablePages: $('disable-pages'),
            deploymentsList: $('deployments-list'),
            pagesUrl: $('pages-url'), pagesSettingsUrl: $('pages-settings-url'), repoUrl: $('repo-url'),

            deployWorkflowSelect: $('deploy-workflow-select'), deployWorkflowInfo: $('deploy-workflow-info'),
            deployRef: $('deploy-ref'), deployInputsContainer: $('deploy-inputs-container'),
            deployDispatchWarning: $('deploy-dispatch-warning'), triggerDeploy: $('trigger-deploy'),
            actionsPageLinkPages: $('actions-page-link-pages'),
            deployRunStatus: $('deploy-run-status'), deployRunInfo: $('deploy-run-info'),
            pollDeployStatus: $('poll-deploy-status'),

            refreshActions: $('refresh-actions'), workflowsList: $('workflows-list'),
            workflowFileSelect: $('workflow-file-select'), workflowFileInfo: $('workflow-file-info'),
            workflowRef: $('workflow-ref'), workflowInputsContainer: $('workflow-inputs-container'),
            workflowDispatchWarning: $('workflow-dispatch-warning'), triggerWorkflow: $('trigger-workflow'),
            workflowRuns: $('workflow-runs'), actionsPageLink: $('actions-page-link'),

            // Manage
            newRepoName: $('new-repo-name'), newRepoDesc: $('new-repo-desc'),
            newRepoVisibility: $('new-repo-visibility'), newRepoReadme: $('new-repo-readme'),
            newRepoCodespaceYml: $('new-repo-codespace-yml'), createRepoBtn: $('create-repo-btn'),
            renameRepoCurrent: $('rename-repo-current'), renameRepoNew: $('rename-repo-new'),
            renameRepoBtn: $('rename-repo-btn'),
            deleteRepoConfirm: $('delete-repo-confirm'), deleteRepoBtn: $('delete-repo-btn'),
            newBranchName: $('new-branch-name'), newBranchFrom: $('new-branch-from'),
            createBranchBtn: $('create-branch-btn'),
            renameBranchSelect: $('rename-branch-select'), renameBranchNew: $('rename-branch-new'),
            renameBranchBtn: $('rename-branch-btn'),
            deleteBranchSelect: $('delete-branch-select'), deleteBranchBtn: $('delete-branch-btn'),
            listReposBtn: $('list-repos-btn'), reposList: $('repos-list'),

            // Codespaces
            refreshCodespaces: $('refresh-codespaces'),
            codespaceBranch: $('codespace-branch'), codespaceMachine: $('codespace-machine'),
            codespaceDisplayName: $('codespace-display-name'), codespaceRetention: $('codespace-retention'),
            createCodespaceBtn: $('create-codespace-btn'),
            pushStartWorkflow: $('push-start-workflow'), pushStopWorkflow: $('push-stop-workflow'),
            pushBothWorkflows: $('push-both-workflows'),
            codespacesList: $('codespaces-list'),

            fontSize: $('font-size'), tabSize: $('tab-size'), wordWrap: $('word-wrap'),
            status: $('status')
        };
    }

    attachEventListeners() {
        document.querySelectorAll('.nav-btn').forEach(btn =>
            btn.addEventListener('click', e => this.switchTab(e.currentTarget.dataset.tab)));

        this.elements.loadRepo.addEventListener('click', () => this.loadRepository());
        this.elements.refreshFiles.addEventListener('click', () => this.loadRepository());
        this.elements.newFile.addEventListener('click', () => this.createNewFile());
        this.elements.saveFile.addEventListener('click', () => this.saveCurrentFile());
        this.elements.deleteFile.addEventListener('click', () => this.deleteCurrentFile());
        this.elements.editor.addEventListener('input', () => this.onEditorChange());

        this.elements.importFile.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.importFolder.addEventListener('click', () => this.elements.folderInput.click());
        this.elements.fileInput.addEventListener('change', e => this.handleFileImport(e));
        this.elements.folderInput.addEventListener('change', e => this.handleFolderImport(e));
        this.elements.exportCurrent.addEventListener('click', () => this.exportCurrentFile());
        this.elements.exportAll.addEventListener('click', () => this.exportAllFiles());
        this.elements.exportZip.addEventListener('click', () => this.downloadRepoZip());
        this.elements.batchCommitBtn.addEventListener('click', () => this.batchCommit());

        this.elements.refreshPages.addEventListener('click', () => this.loadPagesInfo());
        this.elements.pagesSourceType.addEventListener('change', () => this.onSourceTypeChange());
        this.elements.enablePages.addEventListener('click', () => this.enablePages());
        this.elements.disablePages.addEventListener('click', () => this.disablePages());
        this.elements.deployWorkflowSelect.addEventListener('change', () => this.onDeployWorkflowSelect());
        this.elements.triggerDeploy.addEventListener('click', () => this.triggerDeploy());
        this.elements.pollDeployStatus.addEventListener('click', () => this.pollLatestDeployRun());

        this.elements.refreshActions.addEventListener('click', () => this.loadActionsInfo());
        this.elements.workflowFileSelect.addEventListener('change', () => this.onWorkflowFileSelect());
        this.elements.triggerWorkflow.addEventListener('click', () => this.triggerWorkflow());

        // Manage
        this.elements.createRepoBtn.addEventListener('click', () => this.createRepository());
        this.elements.renameRepoBtn.addEventListener('click', () => this.renameRepository());
        this.elements.deleteRepoBtn.addEventListener('click', () => this.deleteRepository());
        this.elements.deleteRepoConfirm.addEventListener('input', () => {
            this.elements.deleteRepoBtn.disabled =
                this.elements.deleteRepoConfirm.value.trim() !== this.repo;
        });
        this.elements.createBranchBtn.addEventListener('click', () => this.createBranch());
        this.elements.renameBranchBtn.addEventListener('click', () => this.renameBranch());
        this.elements.deleteBranchBtn.addEventListener('click', () => this.deleteBranch());
        this.elements.listReposBtn.addEventListener('click', () => this.listRepositories());

        // Codespaces
        this.elements.refreshCodespaces.addEventListener('click', () => this.loadCodespaces());
        this.elements.createCodespaceBtn.addEventListener('click', () => this.createCodespace());
        this.elements.pushStartWorkflow.addEventListener('click', () => this.pushCodespaceWorkflow('start'));
        this.elements.pushStopWorkflow.addEventListener('click', () => this.pushCodespaceWorkflow('stop'));
        this.elements.pushBothWorkflows.addEventListener('click', () => this.pushCodespaceWorkflow('both'));

        this.elements.fontSize.addEventListener('change', () => this.updateEditorSettings());
        this.elements.tabSize.addEventListener('change', () => this.updateEditorSettings());
        this.elements.wordWrap.addEventListener('change', () => this.updateEditorSettings());

        this.elements.patToken.addEventListener('change', () => {
            this.token = this.elements.patToken.value.trim();
            if (this.token) localStorage.setItem('github_pat', this.token);
        });
    }

    loadStoredSettings() {
        if (this.token) this.elements.patToken.value = this.token;
        const s = JSON.parse(localStorage.getItem('editor_settings') || '{}');
        if (s.fontSize) this.elements.fontSize.value = s.fontSize;
        if (s.tabSize)  this.elements.tabSize.value  = s.tabSize;
        if (s.wordWrap !== undefined) this.elements.wordWrap.checked = s.wordWrap;
        this.updateEditorSettings();
    }

    updateEditorSettings() {
        const fs = this.elements.fontSize.value, ts = this.elements.tabSize.value, ww = this.elements.wordWrap.checked;
        this.elements.editor.style.fontSize  = `${fs}px`;
        this.elements.editor.style.tabSize   = ts;
        this.elements.editor.style.whiteSpace = ww ? 'pre-wrap' : 'pre';
        localStorage.setItem('editor_settings', JSON.stringify({ fontSize: fs, tabSize: ts, wordWrap: ww }));
    }

    // ── Navigation ─────────────────────────────────────────────────────────────

    switchTab(tabId) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === `tab-${tabId}`));
    }

    // ── Base64 UTF-8 ───────────────────────────────────────────────────────────

    decodeBase64(b64) {
        try {
            const bin = atob(b64); const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new TextDecoder('utf-8').decode(bytes);
        } catch { return atob(b64); }
    }

    encodeBase64(text) {
        try {
            const bytes = new TextEncoder().encode(text); let bin = '';
            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            return btoa(bin);
        } catch { return btoa(unescape(encodeURIComponent(text))); }
    }

    // ── HTTP Helper ────────────────────────────────────────────────────────────

    async api(path, options = {}) {
        const res = await fetch(`https://api.github.com${path}`, {
            ...options,
            headers: {
                Authorization: `token ${this.token}`,
                Accept: 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                ...(options.headers || {})
            },
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        return res;
    }

    // ── Repository Loading ─────────────────────────────────────────────────────

    async loadRepository() {
        this.token  = this.elements.patToken.value.trim();
        this.owner  = this.elements.repoOwner.value.trim();
        this.repo   = this.elements.repoName.value.trim();
        this.branch = this.elements.branch.value.trim() || 'main';

        if (!this.token) { this.showStatus('Enter your PAT first', 'error'); return; }
        if (!this.owner || !this.repo) { this.showStatus('Enter owner and repo name', 'error'); return; }

        localStorage.setItem('github_pat', this.token);
        this.cacheKey = this.buildCacheKey();
        this.showStatus('Loading repository...', 'info');

        try {
            await this.fetchRepositoryTree();
            await this.loadBranches();
            this.updateQuickLinks();
            this.loadEditsFromCache();
            this.populateWorkflowDropdown();
            this.populateDeployDropdown();
            this.updateManageTab();
            this.showStatus('Repository loaded', 'success');
            this.switchTab('code');
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    async fetchRepositoryTree() {
        const res = await this.api(`/repos/${this.owner}/${this.repo}/git/trees/${this.branch}?recursive=1`);
        if (!res.ok) throw new Error(`Failed to fetch tree: ${res.statusText}`);
        const data = await res.json();

        this.fileTree = data.tree.filter(i => i.type === 'blob');
        this.fileTree.forEach(i => { if (!this.fileSHAs[i.path]) this.fileSHAs[i.path] = i.sha; });
        this.files = this.organizeFiles(data.tree);
        this.ymlFiles = this.fileTree
            .filter(i => /\.(yml|yaml)$/i.test(i.path))
            .map(i => ({ path: i.path, sha: i.sha, isWorkflow: i.path.toLowerCase().startsWith('.github/workflows/') }));

        console.log(`yml files found:`, this.ymlFiles.map(f => f.path));
        this.renderFileTree();
    }

    // ── Manage Tab ─────────────────────────────────────────────────────────────

    updateManageTab() {
        // Update rename / delete fields
        this.elements.renameRepoCurrent.value = this.repo;
        this.elements.renameRepoBtn.disabled = !this.repo;
        this.elements.deleteRepoBtn.disabled = true;
        this.elements.deleteRepoConfirm.value = '';

        // Populate branch selects
        const branchSelects = [
            this.elements.newBranchFrom,
            this.elements.renameBranchSelect,
            this.elements.deleteBranchSelect
        ];
        branchSelects.forEach(sel => {
            sel.innerHTML = this.branches.map(b =>
                `<option value="${b.name}">${b.name}</option>`
            ).join('');
        });

        [this.elements.createBranchBtn, this.elements.renameBranchBtn, this.elements.deleteBranchBtn]
            .forEach(b => b.disabled = false);
    }

    // ── Repository Management ──────────────────────────────────────────────────

    async createRepository() {
        const name = this.elements.newRepoName.value.trim();
        if (!name) { this.showStatus('Enter a repository name', 'error'); return; }

        try {
            this.showStatus('Creating repository...', 'info');
            const res = await this.api('/user/repos', {
                method: 'POST',
                body: {
                    name,
                    description: this.elements.newRepoDesc.value.trim(),
                    private: this.elements.newRepoVisibility.value === 'private',
                    auto_init: this.elements.newRepoReadme.checked
                }
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
            const data = await res.json();

            // Optionally push codespace workflows
            if (this.elements.newRepoCodespaceYml.checked && this.elements.newRepoReadme.checked) {
                await this.pushWorkflowToRepo(
                    this.elements.patToken.value.trim(),
                    data.owner.login, data.name,
                    'start-codespace.yml', CODESPACE_START_WORKFLOW, 'Add start codespace workflow'
                );
                await this.pushWorkflowToRepo(
                    this.elements.patToken.value.trim(),
                    data.owner.login, data.name,
                    'stop-codespace.yml', CODESPACE_STOP_WORKFLOW, 'Add stop codespace workflow'
                );
            }

            this.showStatus(`Repository "${name}" created!`, 'success');
            this.elements.newRepoName.value = '';
            this.elements.newRepoDesc.value = '';
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    async renameRepository() {
        const newName = this.elements.renameRepoNew.value.trim();
        if (!newName) { this.showStatus('Enter a new name', 'error'); return; }
        if (!confirm(`Rename "${this.repo}" to "${newName}"?`)) return;

        try {
            this.showStatus('Renaming repository...', 'info');
            const res = await this.api(`/repos/${this.owner}/${this.repo}`, {
                method: 'PATCH', body: { name: newName }
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
            this.repo = newName;
            this.elements.repoName.value = newName;
            this.elements.renameRepoCurrent.value = newName;
            this.elements.renameRepoNew.value = '';
            this.showStatus(`Renamed to "${newName}"`, 'success');
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    async deleteRepository() {
        if (!confirm(`PERMANENTLY DELETE "${this.repo}"? This cannot be undone!`)) return;

        try {
            this.showStatus('Deleting repository...', 'info');
            const res = await this.api(`/repos/${this.owner}/${this.repo}`, { method: 'DELETE' });
            if (!res.ok && res.status !== 204) throw new Error('Failed to delete repository');
            this.clearRepoCache();
            this.showStatus(`"${this.repo}" deleted`, 'success');
            this.repo = '';
            this.elements.repoName.value = '';
            this.elements.renameRepoCurrent.value = '';
            this.elements.fileTree.innerHTML = '';
            this.elements.editor.value = '';
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    async listRepositories() {
        if (!this.token) { this.showStatus('Enter your PAT first', 'error'); return; }
        this.showStatus('Loading repositories...', 'info');
        try {
            const res = await this.api('/user/repos?per_page=50&sort=updated');
            if (!res.ok) throw new Error(res.statusText);
            const repos = await res.json();

            if (repos.length === 0) {
                this.elements.reposList.innerHTML = '<p class="muted">No repositories found</p>';
                return;
            }

            this.elements.reposList.innerHTML = repos.map(r => `
                <div class="repo-list-item">
                    <div class="repo-info">
                        <span class="repo-name">${r.full_name}</span>
                        <span class="repo-meta">
                            ${r.private ? '🔒 Private' : '🌐 Public'} •
                            ${r.language || 'No language'} •
                            Updated ${new Date(r.updated_at).toLocaleDateString()}
                        </span>
                    </div>
                    <button class="load-repo-btn primary-btn"
                        data-owner="${r.owner.login}" data-repo="${r.name}" data-branch="${r.default_branch}">
                        Load
                    </button>
                </div>
            `).join('');

            this.elements.reposList.querySelectorAll('.load-repo-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.elements.repoOwner.value = btn.dataset.owner;
                    this.elements.repoName.value  = btn.dataset.repo;
                    this.elements.branch.value    = btn.dataset.branch;
                    this.loadRepository();
                });
            });

            this.showStatus(`Loaded ${repos.length} repositories`, 'success');
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    // ── Branch Management ──────────────────────────────────────────────────────

    async createBranch() {
        const name = this.elements.newBranchName.value.trim();
        const from = this.elements.newBranchFrom.value;
        if (!name) { this.showStatus('Enter a branch name', 'error'); return; }
        if (!from) { this.showStatus('Select a source branch', 'error'); return; }

        try {
            this.showStatus('Creating branch...', 'info');
            // Get SHA of source branch
            const refRes = await this.api(`/repos/${this.owner}/${this.repo}/git/ref/heads/${from}`);
            if (!refRes.ok) throw new Error('Could not get source branch SHA');
            const refData = await refRes.json();
            const sha = refData.object.sha;

            const res = await this.api(`/repos/${this.owner}/${this.repo}/git/refs`, {
                method: 'POST', body: { ref: `refs/heads/${name}`, sha }
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
            this.showStatus(`Branch "${name}" created from "${from}"`, 'success');
            this.elements.newBranchName.value = '';
            await this.loadBranches();
            this.updateManageTab();
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    async renameBranch() {
        const from = this.elements.renameBranchSelect.value;
        const to   = this.elements.renameBranchNew.value.trim();
        if (!from || !to) { this.showStatus('Select branch and enter new name', 'error'); return; }
        if (!confirm(`Rename branch "${from}" to "${to}"?`)) return;

        try {
            this.showStatus('Renaming branch...', 'info');
            const res = await this.api(`/repos/${this.owner}/${this.repo}/branches/${from}/rename`, {
                method: 'POST', body: { new_name: to }
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
            this.showStatus(`Branch renamed to "${to}"`, 'success');
            this.elements.renameBranchNew.value = '';
            await this.loadBranches();
            this.updateManageTab();
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    async deleteBranch() {
        const branchName = this.elements.deleteBranchSelect.value;
        if (!branchName) { this.showStatus('Select a branch', 'error'); return; }
        if (!confirm(`Delete branch "${branchName}"?`)) return;

        try {
            this.showStatus('Deleting branch...', 'info');
            const res = await this.api(`/repos/${this.owner}/${this.repo}/git/refs/heads/${branchName}`, {
                method: 'DELETE'
            });
            if (!res.ok && res.status !== 204) throw new Error('Failed to delete branch');
            this.showStatus(`Branch "${branchName}" deleted`, 'success');
            await this.loadBranches();
            this.updateManageTab();
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    // ── Codespaces ─────────────────────────────────────────────────────────────

    async loadCodespaces() {
        if (!this.token) { this.showStatus('Enter your PAT first', 'error'); return; }
        this.showStatus('Loading codespaces...', 'info');
        try {
            const res = await this.api('/user/codespaces?per_page=30');
            if (!res.ok) throw new Error(res.statusText);
            const data = await res.json();
            const all  = data.codespaces || [];

            // Filter to current repo if one is loaded
            const spaces = this.repo
                ? all.filter(c => c.repository?.full_name === `${this.owner}/${this.repo}`)
                : all;

            if (spaces.length === 0) {
                this.elements.codespacesList.innerHTML = '<p class="muted">No codespaces found for this repository</p>';
                this.showStatus('No codespaces found', 'info');
                return;
            }

            this.elements.codespacesList.innerHTML = spaces.map(c => `
                <div class="codespace-item">
                    <div class="codespace-header">
                        <span class="codespace-name">💻 ${c.display_name || c.name}</span>
                        <span class="codespace-status ${c.state}">${c.state}</span>
                    </div>
                    <div class="codespace-meta">
                        📁 ${c.repository?.full_name || 'Unknown repo'} •
                        🌿 ${c.ref || 'Unknown branch'} •
                        🖥️ ${c.machine?.display_name || c.machine?.name || 'Unknown machine'} •
                        🕒 Last used: ${c.last_used_at ? new Date(c.last_used_at).toLocaleDateString() : 'Never'}
                    </div>
                    <div class="codespace-actions">
                        ${c.state === 'Shutdown'
                            ? `<button class="codespace-btn-small primary-btn" onclick="editor.startCodespace('${c.name}')">▶️ Start</button>`
                            : `<button class="codespace-btn-small" onclick="editor.stopCodespace('${c.name}')">⏹️ Stop</button>`
                        }
                        <button class="codespace-btn-small" onclick="window.open('${c.web_url}','_blank')">🌐 Open</button>
                        <button class="codespace-btn-small danger-btn" onclick="editor.deleteCodespace('${c.name}')">🗑️ Delete</button>
                    </div>
                </div>
            `).join('');

            this.showStatus(`Loaded ${spaces.length} codespace(s)`, 'success');
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    async createCodespace() {
        if (!this.owner || !this.repo) { this.showStatus('Load a repository first', 'error'); return; }

        const branch = this.elements.codespaceBranch.value;
        const machine = this.elements.codespaceMachine.value;
        const displayName = this.elements.codespaceDisplayName.value.trim();
        const retention = parseInt(this.elements.codespaceRetention.value);

        try {
            this.showStatus('Creating codespace...', 'info');
            const body = {
                repository_id: await this.getRepoId(),
                ref: branch || this.branch,
                machine
            };
            if (displayName) body.display_name = displayName;
            if (retention > 0) body.retention_period_minutes = retention * 24 * 60;

            const res = await this.api('/user/codespaces', { method: 'POST', body });
            if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
            const data = await res.json();
            this.showStatus(`Codespace "${data.name}" created!`, 'success');
            await this.loadCodespaces();
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    async getRepoId() {
        const res = await this.api(`/repos/${this.owner}/${this.repo}`);
        if (!res.ok) throw new Error('Could not get repository ID');
        const data = await res.json();
        return data.id;
    }

    async startCodespace(name) {
        try {
            this.showStatus(`Starting ${name}...`, 'info');
            const res = await this.api(`/user/codespaces/${name}/start`, { method: 'POST' });
            if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
            this.showStatus(`Codespace started!`, 'success');
            setTimeout(() => this.loadCodespaces(), 2000);
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    async stopCodespace(name) {
        try {
            this.showStatus(`Stopping ${name}...`, 'info');
            const res = await this.api(`/user/codespaces/${name}/stop`, { method: 'POST' });
            if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
            this.showStatus(`Codespace stopped!`, 'success');
            setTimeout(() => this.loadCodespaces(), 2000);
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    async deleteCodespace(name) {
        if (!confirm(`Delete codespace "${name}"?`)) return;
        try {
            this.showStatus(`Deleting ${name}...`, 'info');
            const res = await this.api(`/user/codespaces/${name}`, { method: 'DELETE' });
            if (!res.ok && res.status !== 204) throw new Error('Failed to delete codespace');
            this.showStatus('Codespace deleted', 'success');
            await this.loadCodespaces();
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    async pushCodespaceWorkflow(which) {
        if (!this.owner || !this.repo) { this.showStatus('Load a repository first', 'error'); return; }
        try {
            this.showStatus('Pushing workflow(s)...', 'info');
            if (which === 'start' || which === 'both') {
                await this.pushWorkflowToRepo(this.token, this.owner, this.repo,
                    'start-codespace.yml', CODESPACE_START_WORKFLOW, 'Add start codespace workflow');
            }
            if (which === 'stop' || which === 'both') {
                await this.pushWorkflowToRepo(this.token, this.owner, this.repo,
                    'stop-codespace.yml', CODESPACE_STOP_WORKFLOW, 'Add stop codespace workflow');
            }
            this.showStatus('Workflow(s) pushed!', 'success');
            await this.fetchRepositoryTree();
            this.populateWorkflowDropdown();
            this.populateDeployDropdown();
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    async pushWorkflowToRepo(token, owner, repo, filename, content, message) {
        const path = `.github/workflows/${filename}`;
        const url  = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

        // Check if file exists to get SHA
        let sha;
        const existing = await fetch(url, {
            headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }
        });
        if (existing.ok) {
            const d = await existing.json();
            sha = d.sha;
        }

        const body = { message, content: this.encodeBase64(content) };
        if (sha) body.sha = sha;

        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                Authorization: `token ${token}`,
                Accept: 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
    }

    // ── File Tree ──────────────────────────────────────────────────────────────

    async loadBranches() {
        try {
            const res = await this.api(`/repos/${this.owner}/${this.repo}/branches?per_page=100`);
            if (!res.ok) return;
            this.branches = await res.json();

            // Pages branch select
            this.elements.pagesBranch.innerHTML = '<option value="">Select branch</option>' +
                this.branches.map(b => `<option value="${b.name}">${b.name}</option>`).join('');

            // Codespace branch select
            this.elements.codespaceBranch.innerHTML =
                this.branches.map(b => `<option value="${b.name}">${b.name}</option>`).join('');
        } catch (e) { console.error(e); }
    }

    updateQuickLinks() {
        const base = `https://github.com/${this.owner}/${this.repo}`;
        [
            [this.elements.repoUrl, base],
            [this.elements.pagesSettingsUrl, `${base}/settings/pages`],
            [this.elements.actionsPageLink, `${base}/actions`],
            [this.elements.actionsPageLinkPages, `${base}/actions`]
        ].forEach(([el, href]) => { el.href = href; el.classList.remove('disabled'); });
    }

    organizeFiles(tree) {
        const out = {};
        tree.forEach(item => {
            if (item.type !== 'blob') return;
            const parts = item.path.split('/');
            let cur = out;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!cur[parts[i]]) cur[parts[i]] = {};
                cur = cur[parts[i]];
            }
            cur[parts[parts.length - 1]] = { path: item.path, sha: item.sha, size: item.size };
        });
        return out;
    }

    renderFileTree() {
        this.elements.fileTree.innerHTML = '';
        this.renderTreeLevel(this.files, this.elements.fileTree, '');
    }

    renderTreeLevel(level, container, prefix) {
        const folders = [], files = [];
        Object.keys(level).forEach(k => (level[k].path ? files : folders).push(k));

        folders.sort().forEach(key => {
            const fd = document.createElement('div');
            fd.className = 'folder-item';
            fd.textContent = `📁 ${key}`;
            const cd = document.createElement('div');
            cd.className = 'folder-content';
            cd.style.display = 'none';
            fd.addEventListener('click', e => {
                e.stopPropagation();
                const hidden = cd.style.display === 'none';
                cd.style.display = hidden ? 'block' : 'none';
                fd.textContent = `${hidden ? '📂' : '📁'} ${key}`;
            });
            container.appendChild(fd);
            container.appendChild(cd);
            this.renderTreeLevel(level[key], cd, prefix ? `${prefix}/${key}` : key);
        });

        files.sort().forEach(key => {
            const item = level[key];
            const el = document.createElement('div');
            el.className = 'file-item' + (this.pendingUploads[item.path] ? ' has-changes' : '');
            el.dataset.path = item.path;
            el.textContent = `${this.getFileIcon(key)} ${key}`;
            el.addEventListener('click', () => this.loadFile(item.path));
            container.appendChild(el);
        });
    }

    getFileIcon(n) {
        const ext = n.split('.').pop().toLowerCase();
        return { js:'📜',ts:'📘',json:'📋',html:'🌐',css:'🎨',md:'📝',yml:'⚙️',yaml:'⚙️',
                 py:'🐍',rb:'💎',go:'🔵',rs:'🦀',java:'☕',php:'🐘',sh:'💻',txt:'📄',
                 svg:'🖼️',png:'🖼️',jpg:'🖼️',gif:'🖼️' }[ext] || '📄';
    }

    // ── File I/O ───────────────────────────────────────────────────────────────

    async loadFile(path) {
        try {
            if (this.pendingUploads[path] !== undefined) {
                this.elements.editor.value = this.pendingUploads[path];
                this.elements.editor.disabled = false;
                this.currentFile = path;
                this.elements.currentFile.textContent = `${path} ✏️`;
                this.elements.fileInfo.textContent = 'From local cache — not pushed';
                this.elements.saveFile.disabled = false;
                this.elements.deleteFile.disabled = false;
                this.elements.exportCurrent.disabled = false;
                document.querySelectorAll('.file-item').forEach(el =>
                    el.classList.toggle('active', el.dataset.path === path));
                this.showStatus('Loaded from cache', 'info');
                return;
            }

            this.showStatus('Loading...', 'info');
            const res = await this.api(`/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}?ref=${this.branch}`);
            if (!res.ok) throw new Error(res.statusText);
            const data = await res.json();

            if (this.isBinaryFile(path)) {
                this.elements.editor.value = `[Binary — ${data.size} bytes]`;
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
            this.elements.fileInfo.textContent = `${data.size} bytes | SHA: ${data.sha.substring(0,7)}`;
            this.elements.saveFile.disabled = false;
            this.elements.deleteFile.disabled = false;
            this.elements.exportCurrent.disabled = false;

            document.querySelectorAll('.file-item').forEach(el =>
                el.classList.toggle('active', el.dataset.path === path));
            this.showStatus('File loaded', 'success');
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    isBinaryFile(path) {
        const bin = ['png','jpg','jpeg','gif','bmp','ico','webp','pdf','zip','tar',
                     'gz','exe','dll','so','woff','woff2','ttf','eot','mp3','mp4','wav','avi','mov','webm'];
        return bin.includes(path.split('.').pop().toLowerCase());
    }

    createNewFile() {
        const name = prompt('File name (include path if needed):');
        if (!name) return;
        this.currentFile = name;
        this.pendingUploads[name] = '';
        this.fileContents[name] = '';
        this.elements.editor.value = '';
        this.elements.editor.disabled = false;
        this.elements.currentFile.textContent = `${name} ✏️ (new)`;
        this.elements.fileInfo.textContent = 'New file — not pushed';
        this.elements.saveFile.disabled = false;
        this.elements.deleteFile.disabled = true;
        this.elements.exportCurrent.disabled = false;
        this.saveEditsToCache();
        this.updatePendingList();
    }

    onEditorChange() {
        if (!this.currentFile) return;
        const content = this.elements.editor.value;
        this.pendingUploads[this.currentFile] = content;
        this.fileContents[this.currentFile] = content;
        this.elements.fileInfo.textContent = '✏️ Modified — cached';
        clearTimeout(this._cacheTimer);
        this._cacheTimer = setTimeout(() => this.saveEditsToCache(), 800);
        const el = document.querySelector(`.file-item[data-path="${this.currentFile}"]`);
        if (el) el.classList.add('has-changes');
    }

    async saveCurrentFile() {
        if (!this.currentFile) { this.showStatus('No file selected', 'error'); return; }
        const content = this.elements.editor.value;
        const message = prompt('Commit message:', `Update ${this.currentFile}`);
        if (!message) return;

        try {
            this.showStatus('Saving...', 'info');
            const body = { message, content: this.encodeBase64(content), branch: this.branch };
            if (this.fileSHAs[this.currentFile]) body.sha = this.fileSHAs[this.currentFile];

            const res = await this.api(
                `/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(this.currentFile)}`,
                { method: 'PUT', body }
            );
            if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
            const data = await res.json();

            this.fileSHAs[this.currentFile] = data.content.sha;
            this.fileContents[this.currentFile] = content;
            delete this.pendingUploads[this.currentFile];
            this.saveEditsToCache();
            this.showStatus('Saved!', 'success');
            this.elements.fileInfo.textContent = `Saved | SHA: ${data.content.sha.substring(0,7)}`;
            this.elements.currentFile.textContent = this.currentFile;
            this.updatePendingList();
            await this.fetchRepositoryTree();
            this.populateWorkflowDropdown();
            this.populateDeployDropdown();
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    async deleteCurrentFile() {
        if (!this.currentFile || !this.fileSHAs[this.currentFile]) {
            this.showStatus('Cannot delete unsaved file', 'error'); return;
        }
        if (!confirm(`Delete ${this.currentFile}?`)) return;
        const message = prompt('Commit message:', `Delete ${this.currentFile}`);
        if (!message) return;

        try {
            this.showStatus('Deleting...', 'info');
            const res = await this.api(
                `/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(this.currentFile)}`,
                { method: 'DELETE', body: { message, sha: this.fileSHAs[this.currentFile], branch: this.branch } }
            );
            if (!res.ok) throw new Error(res.statusText);
            delete this.fileContents[this.currentFile];
            delete this.fileSHAs[this.currentFile];
            delete this.pendingUploads[this.currentFile];
            this.saveEditsToCache();
            this.currentFile = null;
            this.elements.editor.value = '';
            this.elements.currentFile.textContent = 'No file selected';
            this.elements.fileInfo.textContent = '';
            this.elements.saveFile.disabled = true;
            this.elements.deleteFile.disabled = true;
            this.elements.exportCurrent.disabled = true;
            this.showStatus('Deleted', 'success');
            await this.fetchRepositoryTree();
            this.populateWorkflowDropdown();
            this.populateDeployDropdown();
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    // ── Import / Export ────────────────────────────────────────────────────────

    async handleFileImport(e) {
        for (const f of e.target.files) await this.importSingleFile(f, f.name);
        e.target.value = '';
        this.saveEditsToCache(); this.updatePendingList();
        this.showStatus(`${e.target.files.length} file(s) cached`, 'success');
    }

    async handleFolderImport(e) {
        for (const f of e.target.files) await this.importSingleFile(f, f.webkitRelativePath || f.name);
        e.target.value = '';
        this.saveEditsToCache(); this.updatePendingList();
        this.showStatus(`${e.target.files.length} file(s) cached`, 'success');
    }

    importSingleFile(file, path) {
        return new Promise(resolve => {
            const r = new FileReader();
            r.onload = e => { this.pendingUploads[path] = e.target.result; this.fileContents[path] = e.target.result; resolve(); };
            r.readAsText(file);
        });
    }

    updatePendingList() {
        const paths = Object.keys(this.pendingUploads);
        this.elements.batchCommitBtn.disabled = paths.length === 0;
        if (paths.length === 0) {
            this.elements.pendingImports.innerHTML = '<p class="muted">No pending changes</p>';
        } else {
            this.elements.pendingImports.innerHTML = `
                <h4>Pending (${paths.length})</h4>
                ${paths.map(p => `
                    <div class="pending-item">
                        <span>${p}</span>
                        <button class="remove-btn" data-path="${p}">✕</button>
                    </div>`).join('')}`;
            this.elements.pendingImports.querySelectorAll('.remove-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    delete this.pendingUploads[btn.dataset.path];
                    this.saveEditsToCache(); this.updatePendingList(); this.renderFileTree();
                });
            });
        }
        this.updateCacheIndicator();
    }

    exportCurrentFile() {
        if (!this.currentFile) { this.showStatus('No file selected', 'error'); return; }
        this.downloadFile(this.currentFile.split('/').pop(), this.elements.editor.value);
        this.showStatus('Exported', 'success');
    }

    async exportAllFiles() {
        if (!this.owner || !this.repo) { this.showStatus('Load a repository first', 'error'); return; }
        this.showStatus('Exporting...', 'info');
        try {
            const out = { repository: `${this.owner}/${this.repo}`, branch: this.branch, exportDate: new Date().toISOString(), files: {} };
            let n = 0;
            for (const item of this.fileTree) {
                if (this.isBinaryFile(item.path)) continue;
                try {
                    const r = await this.api(`/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(item.path)}?ref=${this.branch}`);
                    if (r.ok) { const d = await r.json(); out.files[item.path] = this.decodeBase64(d.content.replace(/\n/g,'')); }
                } catch {}
                if (++n % 10 === 0) this.showStatus(`Exporting ${n}/${this.fileTree.length}...`, 'info');
            }
            this.downloadFile(`${this.repo}-export.json`, JSON.stringify(out, null, 2));
            this.showStatus(`Exported ${Object.keys(out.files).length} files`, 'success');
        } catch (e) { this.showStatus(`Export failed: ${e.message}`, 'error'); }
    }

    downloadRepoZip() {
        if (!this.owner || !this.repo) { this.showStatus('Load a repository first', 'error'); return; }
        window.open(`https://github.com/${this.owner}/${this.repo}/archive/refs/heads/${this.branch}.zip`, '_blank');
    }

    downloadFile(filename, content) {
        const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' })),
            download: filename
        });
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }

    async batchCommit() {
        const paths = Object.keys(this.pendingUploads);
        if (!paths.length) { this.showStatus('No pending changes', 'error'); return; }
        const message = this.elements.batchCommitMessage.value.trim() || 'Update files';
        if (!confirm(`Push ${paths.length} file(s)?\n"${message}"`)) return;

        let saved = 0, failed = 0;
        for (const [path, content] of Object.entries(this.pendingUploads)) {
            this.showStatus(`Pushing ${saved+1}/${paths.length}: ${path}`, 'info');
            try {
                const body = { message, content: this.encodeBase64(content), branch: this.branch };
                if (this.fileSHAs[path]) body.sha = this.fileSHAs[path];
                const r = await this.api(`/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}`, { method: 'PUT', body });
                if (r.ok) { const d = await r.json(); this.fileSHAs[path] = d.content.sha; delete this.pendingUploads[path]; saved++; }
                else failed++;
            } catch { failed++; }
        }

        Object.keys(this.pendingUploads).length === 0 ? this.clearRepoCache() : this.saveEditsToCache();
        this.updatePendingList();
        this.showStatus(
            failed === 0 ? `✅ Pushed ${saved} file(s)! Cache cleared.` : `Pushed ${saved}, failed ${failed}.`,
            failed === 0 ? 'success' : 'error'
        );
        await this.fetchRepositoryTree();
        this.populateWorkflowDropdown();
        this.populateDeployDropdown();
    }

    // ── Workflow Helpers ───────────────────────────────────────────────────────

    populateWorkflowDropdown() { this._fillYmlDropdown(this.elements.workflowFileSelect, this.elements.workflowRef); }
    populateDeployDropdown()   { this._fillYmlDropdown(this.elements.deployWorkflowSelect, this.elements.deployRef); }

    _fillYmlDropdown(select, refInput) {
        select.innerHTML = '';
        if (!this.ymlFiles.length) {
            select.innerHTML = '<option value="">No .yml files found</option>'; return;
        }
        const wf = this.ymlFiles.filter(f => f.isWorkflow).sort((a,b) => a.path.localeCompare(b.path));
        const ot = this.ymlFiles.filter(f => !f.isWorkflow).sort((a,b) => a.path.localeCompare(b.path));

        const def = document.createElement('option');
        def.value = ''; def.textContent = `── Select YAML file (${this.ymlFiles.length}) ──`;
        select.appendChild(def);

        if (wf.length) {
            const g = document.createElement('optgroup');
            g.label = `⚙️  Workflows (${wf.length})`;
            wf.forEach(f => { const o = document.createElement('option'); o.value = f.path; o.textContent = `${f.path}  @${this.branch}`; g.appendChild(o); });
            select.appendChild(g);
        }
        if (ot.length) {
            const g = document.createElement('optgroup');
            g.label = `📄  Other YAML (${ot.length})`;
            ot.forEach(f => { const o = document.createElement('option'); o.value = f.path; o.textContent = `${f.path}  @${this.branch}`; g.appendChild(o); });
            select.appendChild(g);
        }
        if (refInput) refInput.value = this.branch;
    }

    parseWorkflowFile(content) {
        const info = { name: 'Unknown', triggers: [], inputs: [] };
        const nm = content.match(/^name:\s*['"]?(.+?)['"]?\s*$/m); if (nm) info.name = nm[1].trim();
        const onI = content.match(/^on:\s*\[([^\]]+)\]/m);
        const onS = content.match(/^on:\s+(\w[\w_]+)\s*$/m);
        const onB = content.match(/^on:\s*\n([\s\S]*?)(?=\n\S)/m);
        if (onI) info.triggers = onI[1].split(',').map(t=>t.trim());
        else if (onS) info.triggers = [onS[1].trim()];
        else if (onB) info.triggers = [...onB[1].matchAll(/^\s{2}(\w[\w_]+)\s*:/gm)].map(m=>m[1]);
        if (!info.triggers.includes('workflow_dispatch') && content.includes('workflow_dispatch')) info.triggers.push('workflow_dispatch');

        const db = content.match(/workflow_dispatch:\s*\n([\s\S]*?)(?=\n\s{2}[a-z_]+:|\njobs:)/);
        if (db) {
            const ib = db[1].match(/inputs:\s*\n([\s\S]*)/);
            if (ib) {
                const sec = ib[1], re = /^[ ]{6}(\w+):\s*$/gm; let m;
                while ((m = re.exec(sec)) !== null) {
                    const name = m[1], start = m.index + m[0].length;
                    const ni = sec.slice(start).search(/^[ ]{6}\w+:/m);
                    const blk = ni >= 0 ? sec.slice(start, start+ni) : sec.slice(start);
                    const options = [];
                    const ob = blk.match(/options:\s*\n([\s\S]*?)(?=\n[ ]{6,8}\w+:|\Z)/);
                    if (ob) for (const ov of ob[1].matchAll(/^\s+-\s*['"]?(.+?)['"]?\s*$/gm)) options.push(ov[1]);
                    info.inputs.push({
                        name,
                        description: (blk.match(/description:\s*['"]?(.+?)['"]?\s*$/) || [])[1] || '',
                        required:    (blk.match(/required:\s*(true|false)/)            || [])[1] === 'true',
                        default:     (blk.match(/default:\s*['"]?(.+?)['"]?\s*$/)     || [])[1] || '',
                        type:        (blk.match(/type:\s*(\w+)/)                      || [])[1] || 'string',
                        options
                    });
                }
            }
        }
        return info;
    }

    buildWorkflowInfoHTML(path, info) {
        const badges = info.triggers.map(t => {
            const cls = {workflow_dispatch:'dispatch',push:'push',pull_request:'pull_request',schedule:'schedule'}[t]||'other';
            return `<span class="trigger-badge ${cls}">${t}</span>`;
        }).join(' ');
        return `<div class="file-path">📄 ${path}</div>
            <div class="file-details">
                <strong>Name:</strong> ${info.name}<br>
                <strong>Branch:</strong> ${this.branch}<br>
                <strong>Triggers:</strong> ${badges || '<span class="muted">none</span>'}
                ${info.inputs.length ? `<br><strong>Inputs:</strong> ${info.inputs.length}` : ''}
            </div>`;
    }

    buildInputsHTML(inputs) {
        let h = '<h4 style="margin-bottom:8px;color:#8b949e;">Inputs</h4>';
        inputs.forEach(i => {
            h += `<div class="workflow-input-group"><label>${i.name}${i.required?' <span style="color:#f85149">*</span>':''}</label>`;
            if (i.type === 'choice' && i.options.length)
                h += `<select data-input-name="${i.name}">${i.options.map(o=>`<option ${o===i.default?'selected':''}>${o}</option>`).join('')}</select>`;
            else if (i.type === 'boolean')
                h += `<label class="checkbox-label"><input type="checkbox" data-input-name="${i.name}" ${i.default==='true'?'checked':''}> ${i.description||'Enable'}</label>`;
            else
                h += `<input type="text" data-input-name="${i.name}" placeholder="${i.default||i.description||''}" value="${i.default||''}">`;
            if (i.description && i.type !== 'boolean') h += `<small>${i.description}</small>`;
            h += '</div>';
        });
        return h;
    }

    collectInputs(container) {
        const out = {};
        container.querySelectorAll('[data-input-name]').forEach(el => {
            const n = el.dataset.inputName;
            if (el.type === 'checkbox') out[n] = String(el.checked);
            else if (el.value.trim()) out[n] = el.value.trim();
        });
        return out;
    }

    async _loadAndShowWorkflow(path, infoEl, warnEl, triggerBtn, inputsEl, refInput) {
        infoEl.innerHTML = ''; infoEl.style && (infoEl.style.display = 'none');
        if (inputsEl) inputsEl.innerHTML = '';
        warnEl.style.display = 'none';
        triggerBtn.disabled = true;
        if (!path) return;

        try {
            const res = await this.api(`/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}?ref=${this.branch}`);
            if (!res.ok) throw new Error('Failed to fetch file');
            const data = await res.json();
            const content = this.decodeBase64(data.content.replace(/\n/g,''));
            const info = this.parseWorkflowFile(content);

            infoEl.innerHTML = this.buildWorkflowInfoHTML(path, info);
            if (infoEl.style) infoEl.style.display = 'block';

            const isWfDir = path.toLowerCase().startsWith('.github/workflows/');
            const hasDispatch = info.triggers.includes('workflow_dispatch');

            if (!isWfDir) {
                warnEl.innerHTML = '⚠️ Not in <code>.github/workflows/</code> — cannot be triggered as Actions.';
                warnEl.style.display = 'block';
            } else if (!hasDispatch) {
                warnEl.innerHTML = '⚠️ No <code>workflow_dispatch</code> trigger found.';
                warnEl.style.display = 'block';
            } else {
                triggerBtn.disabled = false;
                if (inputsEl && info.inputs.length) inputsEl.innerHTML = this.buildInputsHTML(info.inputs);
            }
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    async onWorkflowFileSelect() {
        await this._loadAndShowWorkflow(
            this.elements.workflowFileSelect.value,
            this.elements.workflowFileInfo,
            this.elements.workflowDispatchWarning,
            this.elements.triggerWorkflow,
            this.elements.workflowInputsContainer,
            this.elements.workflowRef
        );
    }

    async onDeployWorkflowSelect() {
        this.elements.deployRunStatus.style.display = 'none';
        await this._loadAndShowWorkflow(
            this.elements.deployWorkflowSelect.value,
            this.elements.deployWorkflowInfo,
            this.elements.deployDispatchWarning,
            this.elements.triggerDeploy,
            this.elements.deployInputsContainer,
            this.elements.deployRef
        );
    }

    async _dispatchWorkflow(path, ref, inputsContainer) {
        const fileName = path.split('/').pop();
        const inputs   = this.collectInputs(inputsContainer);
        const body     = { ref };
        if (Object.keys(inputs).length) body.inputs = inputs;

        const res = await this.api(
            `/repos/${this.owner}/${this.repo}/actions/workflows/${fileName}/dispatches`,
            { method: 'POST', body }
        );
        if (!res.ok) { const e = await res.json(); throw new Error(e.message || res.statusText); }
    }

    async triggerWorkflow() {
        const path = this.elements.workflowFileSelect.value;
        if (!path) { this.showStatus('Select a workflow', 'error'); return; }
        try {
            this.showStatus('Triggering...', 'info');
            await this._dispatchWorkflow(path, this.elements.workflowRef.value || this.branch, this.elements.workflowInputsContainer);
            this.showStatus('Workflow triggered!', 'success');
            if (confirm('Open Actions page?')) window.open(`https://github.com/${this.owner}/${this.repo}/actions`, '_blank');
            setTimeout(() => this.loadWorkflowRuns(), 3000);
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    async triggerDeploy() {
        const path = this.elements.deployWorkflowSelect.value;
        if (!path) { this.showStatus('Select a workflow', 'error'); return; }
        try {
            this.showStatus('Deploying...', 'info');
            this.elements.triggerDeploy.disabled = true;
            this.elements.triggerDeploy.textContent = '⏳ Deploying...';
            await this._dispatchWorkflow(path, this.elements.deployRef.value || this.branch, this.elements.deployInputsContainer);
            this.showStatus('Deployment triggered!', 'success');
            this.elements.triggerDeploy.textContent = '🚀 Deploy Now';
            this.elements.triggerDeploy.disabled = false;
            this.elements.deployRunStatus.style.display = 'block';
            this.elements.deployRunInfo.innerHTML = '<div class="deploy-run-row"><span class="deploy-run-label">Status</span><span class="deploy-run-value"><span class="spinning">⏳</span> Waiting…</span></div>';
            setTimeout(() => this.pollLatestDeployRun(path.split('/').pop()), 4000);
        } catch (e) {
            this.elements.triggerDeploy.textContent = '🚀 Deploy Now';
            this.elements.triggerDeploy.disabled = false;
            this.showStatus(`Error: ${e.message}`, 'error');
        }
    }

    async pollLatestDeployRun(workflowFileName) {
        const path = this.elements.deployWorkflowSelect.value;
        const fn   = workflowFileName || (path ? path.split('/').pop() : null);
        if (!fn) return;
        try {
            const wfRes  = await this.api(`/repos/${this.owner}/${this.repo}/actions/workflows`);
            const wfList = wfRes.ok ? (await wfRes.json()).workflows || [] : [];
            const matched = wfList.find(w => w.path.endsWith(fn));
            const runsUrl = matched
                ? `/repos/${this.owner}/${this.repo}/actions/workflows/${matched.id}/runs?per_page=1`
                : `/repos/${this.owner}/${this.repo}/actions/runs?per_page=5`;
            const rRes = await this.api(runsUrl);
            if (!rRes.ok) return;
            const runs = (await rRes.json()).workflow_runs || [];
            if (!runs.length) { this.elements.deployRunInfo.innerHTML = '<div class="deploy-run-row"><span class="muted">No runs yet</span></div>'; return; }
            this.renderDeployRunInfo(runs[0]);
            const st = runs[0].status;
            if (st === 'in_progress' || st === 'queued' || st === 'waiting') {
                clearTimeout(this._pollTimer);
                this._pollTimer = setTimeout(() => this.pollLatestDeployRun(fn), 6000);
            }
        } catch (e) { console.error(e); }
    }

    renderDeployRunInfo(run) {
        const colorMap = { success:'#3fb950', failure:'#f85149', cancelled:'#8b949e', in_progress:'#58a6ff', queued:'#f0883e' };
        const iconMap  = { success:'✅', failure:'❌', cancelled:'⛔', in_progress:'⏳', queued:'🕐' };
        const key = run.conclusion || run.status;
        const color = colorMap[key] || '#c9d1d9';
        const icon  = iconMap[key]  || '❓';
        const isRunning = ['in_progress','queued','waiting'].includes(run.status);
        const statusText = run.conclusion ? `${icon} ${run.conclusion}` : `${isRunning?'<span class="spinning">⏳</span>':icon} ${run.status}`;
        const dur = run.run_started_at && run.updated_at
            ? Math.round((new Date(run.updated_at)-new Date(run.run_started_at))/1000)+'s' : '—';

        this.elements.deployRunInfo.innerHTML = `
            <div class="deploy-run-row"><span class="deploy-run-label">Run</span><span class="deploy-run-value">#${run.run_number} — ${run.name}</span></div>
            <div class="deploy-run-row"><span class="deploy-run-label">Status</span><span class="deploy-run-value" style="color:${color}">${statusText}</span></div>
            <div class="deploy-run-row"><span class="deploy-run-label">Branch</span><span class="deploy-run-value">${run.head_branch}</span></div>
            <div class="deploy-run-row"><span class="deploy-run-label">Duration</span><span class="deploy-run-value">${dur}</span></div>
            <div class="deploy-run-row"><span class="deploy-run-label">Commit</span><span class="deploy-run-value">${(run.head_sha||'').substring(0,7)}</span></div>
            <div class="deploy-run-row"><span class="deploy-run-label">View</span><span class="deploy-run-value"><a href="${run.html_url}" target="_blank" style="color:#58a6ff;">GitHub ↗</a></span></div>
            ${isRunning?'<div class="deploy-run-row"><span class="deploy-run-label" style="color:#58a6ff;">Auto-refreshing…</span></div>':''}`;
    }

    // ── Pages ──────────────────────────────────────────────────────────────────

    onSourceTypeChange() {
        this.elements.branchSourceConfig.style.display =
            this.elements.pagesSourceType.value === 'actions' ? 'none' : 'flex';
    }

    async loadPagesInfo() {
        if (!this.owner || !this.repo) { this.showStatus('Load a repository first', 'error'); return; }
        this.showStatus('Loading Pages...', 'info');
        try {
            const r = await this.api(`/repos/${this.owner}/${this.repo}/pages`);
            if (r.ok) {
                const d = await r.json();
                this.displayPagesStatus(d);
                if (d.build_type === 'workflow') { this.elements.pagesSourceType.value = 'actions'; this.onSourceTypeChange(); }
            } else if (r.status === 404) {
                this.elements.pagesStatus.innerHTML = '<div class="status-row"><span class="status-label">Status</span><span class="status-value inactive">Not Enabled</span></div>';
            }
            await this.loadDeployments();
            this.showStatus('Pages info loaded', 'success');
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    displayPagesStatus(d) {
        this.elements.pagesStatus.innerHTML = `
            <div class="status-row"><span class="status-label">Status</span><span class="status-value ${d.status==='built'?'active':''}">${d.status||'Unknown'}</span></div>
            <div class="status-row"><span class="status-label">Build</span><span class="status-value">${d.build_type==='workflow'?'⚙️ Actions':'🌿 Branch'}</span></div>
            <div class="status-row"><span class="status-label">URL</span><span class="status-value"><a href="${d.html_url}" target="_blank">${d.html_url}</a></span></div>
            ${d.source?`<div class="status-row"><span class="status-label">Source</span><span class="status-value">${d.source.branch} / ${d.source.path||'/'}</span></div>`:''}`;
        if (d.html_url) { this.elements.pagesUrl.href = d.html_url; this.elements.pagesUrl.classList.remove('disabled'); }
        if (d.source)   { this.elements.pagesBranch.value = d.source.branch; this.elements.pagesPath.value = d.source.path; }
    }

    async loadDeployments() {
        try {
            const r = await this.api(`/repos/${this.owner}/${this.repo}/deployments`);
            if (!r.ok) return;
            const deps = await r.json();
            this.elements.deploymentsList.innerHTML = !deps.length ? '<p class="muted">No deployments</p>'
                : deps.slice(0,5).map(d => `
                    <div class="deployment-item">
                        <div><span class="workflow-name">${d.environment}</span><div class="workflow-path">${d.ref} • ${new Date(d.created_at).toLocaleDateString()}</div></div>
                    </div>`).join('');
        } catch {}
    }

    async enablePages() {
        const type = this.elements.pagesSourceType.value;
        let body;
        if (type === 'actions') { body = { build_type: 'workflow' }; }
        else {
            const branch = this.elements.pagesBranch.value;
            if (!branch) { this.showStatus('Select a branch', 'error'); return; }
            body = { build_type: 'legacy', source: { branch, path: this.elements.pagesPath.value } };
        }
        try {
            this.showStatus('Updating Pages...', 'info');
            let r = await this.api(`/repos/${this.owner}/${this.repo}/pages`, { method: 'PUT', body });
            if (r.status === 404 || r.status === 405)
                r = await this.api(`/repos/${this.owner}/${this.repo}/pages`, { method: 'POST', body });
            if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
            this.showStatus('Pages updated!', 'success');
            await this.loadPagesInfo();
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    async disablePages() {
        if (!confirm('Disable GitHub Pages?')) return;
        try {
            const r = await this.api(`/repos/${this.owner}/${this.repo}/pages`, { method: 'DELETE' });
            if (!r.ok && r.status !== 204) throw new Error('Failed');
            this.showStatus('Pages disabled', 'success');
            await this.loadPagesInfo();
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    // ── Actions ────────────────────────────────────────────────────────────────

    async loadActionsInfo() {
        if (!this.owner || !this.repo) { this.showStatus('Load a repository first', 'error'); return; }
        this.showStatus('Loading Actions...', 'info');
        try {
            const r = await this.api(`/repos/${this.owner}/${this.repo}/actions/workflows`);
            if (r.ok) { this.workflows = (await r.json()).workflows || []; this.displayRegisteredWorkflows(); }
            await this.loadWorkflowRuns();
            this.showStatus('Actions loaded', 'success');
        } catch (e) { this.showStatus(`Error: ${e.message}`, 'error'); }
    }

    displayRegisteredWorkflows() {
        this.elements.workflowsList.innerHTML = !this.workflows.length ? '<p class="muted">No workflows found</p>'
            : this.workflows.map(wf => `
                <div class="workflow-item">
                    <div><div class="workflow-name">${wf.name}</div><div class="workflow-path">${wf.path}</div></div>
                    <span class="run-status ${wf.state}">${wf.state}</span>
                </div>`).join('');
    }

    async loadWorkflowRuns() {
        try {
            const r = await this.api(`/repos/${this.owner}/${this.repo}/actions/runs?per_page=10`);
            if (!r.ok) return;
            const runs = (await r.json()).workflow_runs || [];
            this.elements.workflowRuns.innerHTML = !runs.length ? '<p class="muted">No recent runs</p>'
                : runs.map(run => `
                    <div class="run-item">
                        <div><div class="run-name">${run.name}</div><div class="workflow-path">${run.head_branch} • ${new Date(run.created_at).toLocaleDateString()}</div></div>
                        <span class="run-status ${run.conclusion||run.status}">${run.conclusion||run.status}</span>
                    </div>`).join('');
        } catch {}
    }

    // ── Status Toast ───────────────────────────────────────────────────────────

    showStatus(message, type) {
        this.elements.status.textContent = message;
        this.elements.status.className = `status ${type}`;
        if (type !== 'info') setTimeout(() => { this.elements.status.className = 'status'; }, 4000);
    }
}

document.addEventListener('DOMContentLoaded', () => { window.editor = new GitHubEditor(); });