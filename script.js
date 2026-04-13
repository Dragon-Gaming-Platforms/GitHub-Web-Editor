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
        this.cacheKey = '';
        this._pollTimer = null;

        this.initializeElements();
        this.attachEventListeners();
        this.loadStoredSettings();
    }

    // ─── Cache ────────────────────────────────────────────────────────────────

    buildCacheKey() {
        return `ghcache_${this.owner}_${this.repo}_${this.branch}`;
    }

    saveEditsToCache() {
        if (!this.cacheKey) return;
        localStorage.setItem(this.cacheKey, JSON.stringify({
            owner: this.owner,
            repo: this.repo,
            branch: this.branch,
            timestamp: Date.now(),
            edits: this.pendingUploads,
            shas: this.fileSHAs
        }));
        this.updateCacheIndicator();
    }

    loadEditsFromCache() {
        if (!this.cacheKey) return;
        try {
            const raw = localStorage.getItem(this.cacheKey);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (data.edits) {
                this.pendingUploads = data.edits;
                this.fileContents = { ...this.fileContents, ...data.edits };
            }
            if (data.shas) {
                this.fileSHAs = { ...this.fileSHAs, ...data.shas };
            }
            this.updatePendingList();
            this.updateCacheIndicator();
            const count = Object.keys(this.pendingUploads).length;
            if (count > 0) this.showStatus(`Restored ${count} unsaved edit(s) from cache`, 'info');
        } catch (e) { console.error('Cache load error:', e); }
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
        const count = Object.keys(this.pendingUploads).length;
        if (count > 0) {
            el.textContent = `💾 ${count} unsaved edit(s)`;
            el.className = 'cache-indicator has-edits';
        } else {
            el.textContent = 'Cache clear';
            el.className = 'cache-indicator';
        }
    }

    // ─── Init ─────────────────────────────────────────────────────────────────

    initializeElements() {
        this.elements = {
            patToken: document.getElementById('pat-token'),
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

            // Pages
            refreshPages: document.getElementById('refresh-pages'),
            pagesStatus: document.getElementById('pages-status'),
            pagesSourceType: document.getElementById('pages-source-type'),
            branchSourceConfig: document.getElementById('branch-source-config'),
            pagesBranch: document.getElementById('pages-branch'),
            pagesPath: document.getElementById('pages-path'),
            enablePages: document.getElementById('enable-pages'),
            disablePages: document.getElementById('disable-pages'),
            deploymentsList: document.getElementById('deployments-list'),
            pagesUrl: document.getElementById('pages-url'),
            pagesSettingsUrl: document.getElementById('pages-settings-url'),
            repoUrl: document.getElementById('repo-url'),

            // Deploy via Actions (Pages tab)
            deployWorkflowSelect: document.getElementById('deploy-workflow-select'),
            deployWorkflowInfo: document.getElementById('deploy-workflow-info'),
            deployRef: document.getElementById('deploy-ref'),
            deployInputsContainer: document.getElementById('deploy-inputs-container'),
            deployDispatchWarning: document.getElementById('deploy-dispatch-warning'),
            triggerDeploy: document.getElementById('trigger-deploy'),
            actionsPageLinkPages: document.getElementById('actions-page-link-pages'),
            deployRunStatus: document.getElementById('deploy-run-status'),
            deployRunInfo: document.getElementById('deploy-run-info'),
            pollDeployStatus: document.getElementById('poll-deploy-status'),

            // Actions tab
            refreshActions: document.getElementById('refresh-actions'),
            workflowsList: document.getElementById('workflows-list'),
            workflowFileSelect: document.getElementById('workflow-file-select'),
            workflowFileInfo: document.getElementById('workflow-file-info'),
            workflowRef: document.getElementById('workflow-ref'),
            workflowInputsContainer: document.getElementById('workflow-inputs-container'),
            workflowDispatchWarning: document.getElementById('workflow-dispatch-warning'),
            triggerWorkflow: document.getElementById('trigger-workflow'),
            workflowRuns: document.getElementById('workflow-runs'),
            actionsPageLink: document.getElementById('actions-page-link'),

            fontSize: document.getElementById('font-size'),
            tabSize: document.getElementById('tab-size'),
            wordWrap: document.getElementById('word-wrap'),

            status: document.getElementById('status')
        };
    }

    attachEventListeners() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', e => this.switchTab(e.currentTarget.dataset.tab));
        });

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

        // Pages
        this.elements.refreshPages.addEventListener('click', () => this.loadPagesInfo());
        this.elements.pagesSourceType.addEventListener('change', () => this.onSourceTypeChange());
        this.elements.enablePages.addEventListener('click', () => this.enablePages());
        this.elements.disablePages.addEventListener('click', () => this.disablePages());

        // Deploy via Actions (Pages tab)
        this.elements.deployWorkflowSelect.addEventListener('change', () => this.onDeployWorkflowSelect());
        this.elements.triggerDeploy.addEventListener('click', () => this.triggerDeploy());
        this.elements.pollDeployStatus.addEventListener('click', () => this.pollLatestDeployRun());

        // Actions tab
        this.elements.refreshActions.addEventListener('click', () => this.loadActionsInfo());
        this.elements.workflowFileSelect.addEventListener('change', () => this.onWorkflowFileSelect());
        this.elements.triggerWorkflow.addEventListener('click', () => this.triggerWorkflow());

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
        if (s.tabSize) this.elements.tabSize.value = s.tabSize;
        if (s.wordWrap !== undefined) this.elements.wordWrap.checked = s.wordWrap;
        this.updateEditorSettings();
    }

    updateEditorSettings() {
        const fs = this.elements.fontSize.value;
        const ts = this.elements.tabSize.value;
        const ww = this.elements.wordWrap.checked;
        this.elements.editor.style.fontSize = `${fs}px`;
        this.elements.editor.style.tabSize = ts;
        this.elements.editor.style.whiteSpace = ww ? 'pre-wrap' : 'pre';
        localStorage.setItem('editor_settings', JSON.stringify({ fontSize: fs, tabSize: ts, wordWrap: ww }));
    }

    // ─── Navigation ───────────────────────────────────────────────────────────

    switchTab(tabId) {
        document.querySelectorAll('.nav-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.tab === tabId));
        document.querySelectorAll('.tab-content').forEach(t =>
            t.classList.toggle('active', t.id === `tab-${tabId}`));
    }

    // ─── Base64 UTF-8 ─────────────────────────────────────────────────────────

    decodeBase64(b64) {
        try {
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new TextDecoder('utf-8').decode(bytes);
        } catch { return atob(b64); }
    }

    encodeBase64(text) {
        try {
            const bytes = new TextEncoder().encode(text);
            let bin = '';
            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            return btoa(bin);
        } catch { return btoa(unescape(encodeURIComponent(text))); }
    }

    // ─── Repository ───────────────────────────────────────────────────────────

    async loadRepository() {
        this.token = this.elements.patToken.value.trim();
        this.owner = this.elements.repoOwner.value.trim();
        this.repo = this.elements.repoName.value.trim();
        this.branch = this.elements.branch.value.trim() || 'main';

        if (!this.token) { this.showStatus('Please enter your PAT', 'error'); return; }
        if (!this.owner || !this.repo) { this.showStatus('Please enter owner and repo name', 'error'); return; }

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
            this.showStatus('Repository loaded successfully', 'success');
            this.switchTab('code');
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
        }
    }

    async fetchRepositoryTree() {
        const url = `https://api.github.com/repos/${this.owner}/${this.repo}/git/trees/${this.branch}?recursive=1`;
        const response = await fetch(url, {
            headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json' }
        });
        if (!response.ok) throw new Error(`Failed to fetch repository: ${response.statusText}`);

        const data = await response.json();
        this.fileTree = data.tree.filter(i => i.type === 'blob');

        this.fileTree.forEach(item => {
            if (!this.fileSHAs[item.path]) this.fileSHAs[item.path] = item.sha;
        });

        this.files = this.organizeFiles(data.tree);

        this.ymlFiles = this.fileTree
            .filter(i => /\.(yml|yaml)$/i.test(i.path))
            .map(i => ({
                path: i.path,
                sha: i.sha,
                isWorkflow: i.path.toLowerCase().startsWith('.github/workflows/')
            }));

        console.log(`Found ${this.ymlFiles.length} yml/yaml files:`, this.ymlFiles.map(f => f.path));
        this.renderFileTree();
    }

    // ─── Deploy Workflow Dropdown (Pages tab) ─────────────────────────────────

    populateDeployDropdown() {
        const select = this.elements.deployWorkflowSelect;
        select.innerHTML = '';
        this.elements.deployRef.value = this.branch;

        if (this.ymlFiles.length === 0) {
            select.innerHTML = '<option value="">No .yml files found</option>';
            return;
        }

        const workflowFiles = this.ymlFiles.filter(f => f.isWorkflow);
        const otherYml = this.ymlFiles.filter(f => !f.isWorkflow);

        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = `── Select deploy workflow (${this.ymlFiles.length} found) ──`;
        select.appendChild(defaultOpt);

        if (workflowFiles.length > 0) {
            const grp = document.createElement('optgroup');
            grp.label = `⚙️  GitHub Actions Workflows (${workflowFiles.length})`;
            workflowFiles.sort((a, b) => a.path.localeCompare(b.path)).forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.path;
                opt.textContent = `${f.path}  @${this.branch}`;
                opt.dataset.isWorkflow = 'true';
                grp.appendChild(opt);
            });
            select.appendChild(grp);
        }

        if (otherYml.length > 0) {
            const grp = document.createElement('optgroup');
            grp.label = `📄  Other YAML Files (${otherYml.length})`;
            otherYml.sort((a, b) => a.path.localeCompare(b.path)).forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.path;
                opt.textContent = `${f.path}  @${this.branch}`;
                opt.dataset.isWorkflow = 'false';
                grp.appendChild(opt);
            });
            select.appendChild(grp);
        }
    }

    async onDeployWorkflowSelect() {
        const path = this.elements.deployWorkflowSelect.value;
        this.elements.deployWorkflowInfo.style.display = 'none';
        this.elements.deployInputsContainer.innerHTML = '';
        this.elements.deployDispatchWarning.style.display = 'none';
        this.elements.triggerDeploy.disabled = true;
        this.elements.deployRunStatus.style.display = 'none';

        if (!path) return;

        try {
            this.showStatus('Reading workflow file...', 'info');

            const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}?ref=${this.branch}`;
            const response = await fetch(url, {
                headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json' }
            });
            if (!response.ok) throw new Error('Failed to fetch workflow file');

            const data = await response.json();
            const content = this.decodeBase64(data.content.replace(/\n/g, ''));
            const info = this.parseWorkflowFile(content);

            // Show file info panel
            this.elements.deployWorkflowInfo.style.display = 'block';
            this.elements.deployWorkflowInfo.innerHTML = this.buildWorkflowInfoHTML(path, info);

            const isWorkflowDir = path.toLowerCase().startsWith('.github/workflows/');
            const hasDispatch = info.triggers.includes('workflow_dispatch');

            if (!isWorkflowDir) {
                this.elements.deployDispatchWarning.innerHTML =
                    '⚠️ This file is not in <code>.github/workflows/</code>. It cannot be triggered as a GitHub Actions workflow.';
                this.elements.deployDispatchWarning.style.display = 'block';
            } else if (!hasDispatch) {
                this.elements.deployDispatchWarning.innerHTML =
                    '⚠️ This workflow has no <code>workflow_dispatch</code> trigger. Add it to the <code>on:</code> block to enable manual deploys.';
                this.elements.deployDispatchWarning.style.display = 'block';
            } else {
                this.elements.triggerDeploy.disabled = false;
                if (info.inputs.length > 0) {
                    this.elements.deployInputsContainer.innerHTML =
                        this.buildInputsHTML(info.inputs);
                }
            }

            this.showStatus('Workflow loaded', 'success');
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
        }
    }

    async triggerDeploy() {
        const path = this.elements.deployWorkflowSelect.value;
        if (!path) { this.showStatus('Select a workflow', 'error'); return; }

        const ref = this.elements.deployRef.value.trim() || this.branch;
        const workflowFileName = path.split('/').pop();

        const inputs = this.collectInputs(this.elements.deployInputsContainer);

        try {
            this.showStatus('Triggering deployment...', 'info');
            this.elements.triggerDeploy.disabled = true;
            this.elements.triggerDeploy.textContent = '⏳ Deploying...';

            const body = { ref };
            if (Object.keys(inputs).length > 0) body.inputs = inputs;

            const response = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/actions/workflows/${workflowFileName}/dispatches`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `token ${this.token}`,
                        Accept: 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                }
            );

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || response.statusText);
            }

            this.showStatus('Deployment triggered! Polling for status...', 'success');
            this.elements.triggerDeploy.textContent = '🚀 Deploy Now';
            this.elements.triggerDeploy.disabled = false;

            // Show status panel and start polling
            this.elements.deployRunStatus.style.display = 'block';
            this.elements.deployRunInfo.innerHTML =
                `<div class="deploy-run-row">
                    <span class="deploy-run-label">Status</span>
                    <span class="deploy-run-value"><span class="spinning">⏳</span> Waiting for run to start…</span>
                </div>`;

            // Wait a moment then start polling
            setTimeout(() => this.pollLatestDeployRun(workflowFileName), 4000);

        } catch (error) {
            this.elements.triggerDeploy.textContent = '🚀 Deploy Now';
            this.elements.triggerDeploy.disabled = false;
            this.showStatus(`Deploy failed: ${error.message}`, 'error');
        }
    }

    async pollLatestDeployRun(workflowFileName) {
        const path = this.elements.deployWorkflowSelect.value;
        const fileName = workflowFileName || (path ? path.split('/').pop() : null);
        if (!fileName) return;

        try {
            // Find this workflow's ID first
            const wfListResp = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/actions/workflows`,
                { headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json' } }
            );

            if (!wfListResp.ok) return;
            const wfList = await wfListResp.json();
            const matched = (wfList.workflows || []).find(w =>
                w.path.endsWith(fileName) || w.path === path
            );

            const runsUrl = matched
                ? `https://api.github.com/repos/${this.owner}/${this.repo}/actions/workflows/${matched.id}/runs?per_page=1`
                : `https://api.github.com/repos/${this.owner}/${this.repo}/actions/runs?per_page=5`;

            const runsResp = await fetch(runsUrl, {
                headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json' }
            });

            if (!runsResp.ok) return;
            const runsData = await runsResp.json();
            const runs = runsData.workflow_runs || [];

            if (runs.length === 0) {
                this.elements.deployRunInfo.innerHTML =
                    `<div class="deploy-run-row">
                        <span class="deploy-run-label">Status</span>
                        <span class="deploy-run-value muted">No runs found yet — try refreshing</span>
                    </div>`;
                return;
            }

            const run = runs[0];
            this.renderDeployRunInfo(run);

            // Auto-poll if still running
            if (run.status === 'in_progress' || run.status === 'queued' || run.status === 'waiting') {
                clearTimeout(this._pollTimer);
                this._pollTimer = setTimeout(() => this.pollLatestDeployRun(workflowFileName), 6000);
            }

        } catch (e) {
            console.error('Poll error:', e);
        }
    }

    renderDeployRunInfo(run) {
        const statusColor = {
            success: '#3fb950',
            failure: '#f85149',
            cancelled: '#8b949e',
            in_progress: '#58a6ff',
            queued: '#f0883e',
            waiting: '#f0883e'
        }[run.conclusion || run.status] || '#c9d1d9';

        const statusIcon = {
            success: '✅',
            failure: '❌',
            cancelled: '⛔',
            in_progress: '⏳',
            queued: '🕐',
            waiting: '🕐'
        }[run.conclusion || run.status] || '❓';

        const isRunning = run.status === 'in_progress' || run.status === 'queued' || run.status === 'waiting';
        const statusText = run.conclusion
            ? `${statusIcon} ${run.conclusion}`
            : `${isRunning ? '<span class="spinning">⏳</span>' : statusIcon} ${run.status}`;

        const started = run.run_started_at
            ? new Date(run.run_started_at).toLocaleString()
            : new Date(run.created_at).toLocaleString();

        const duration = run.run_started_at && run.updated_at
            ? Math.round((new Date(run.updated_at) - new Date(run.run_started_at)) / 1000) + 's'
            : '—';

        this.elements.deployRunInfo.innerHTML = `
            <div class="deploy-run-row">
                <span class="deploy-run-label">Run</span>
                <span class="deploy-run-value">#${run.run_number} — ${run.name}</span>
            </div>
            <div class="deploy-run-row">
                <span class="deploy-run-label">Status</span>
                <span class="deploy-run-value" style="color:${statusColor}">${statusText}</span>
            </div>
            <div class="deploy-run-row">
                <span class="deploy-run-label">Branch</span>
                <span class="deploy-run-value">${run.head_branch}</span>
            </div>
            <div class="deploy-run-row">
                <span class="deploy-run-label">Triggered</span>
                <span class="deploy-run-value">${started}</span>
            </div>
            <div class="deploy-run-row">
                <span class="deploy-run-label">Duration</span>
                <span class="deploy-run-value">${duration}</span>
            </div>
            <div class="deploy-run-row">
                <span class="deploy-run-label">Commit</span>
                <span class="deploy-run-value">${run.head_sha ? run.head_sha.substring(0, 7) : '—'}</span>
            </div>
            <div class="deploy-run-row">
                <span class="deploy-run-label">View</span>
                <span class="deploy-run-value">
                    <a href="${run.html_url}" target="_blank" style="color:#58a6ff;">Open on GitHub ↗</a>
                </span>
            </div>
            ${isRunning ? '<div class="deploy-run-row"><span class="deploy-run-label" style="color:#58a6ff;">Auto-refreshing every 6s…</span></div>' : ''}
        `;
    }

    // ─── Pages Source Type Toggle ─────────────────────────────────────────────

    onSourceTypeChange() {
        const isActions = this.elements.pagesSourceType.value === 'actions';
        this.elements.branchSourceConfig.style.display = isActions ? 'none' : 'flex';
    }

    // ─── Workflow Dropdown (Actions tab) ──────────────────────────────────────

    populateWorkflowDropdown() {
        const select = this.elements.workflowFileSelect;
        select.innerHTML = '';

        if (this.ymlFiles.length === 0) {
            select.innerHTML = '<option value="">No .yml / .yaml files found</option>';
            return;
        }

        const workflowFiles = this.ymlFiles.filter(f => f.isWorkflow);
        const otherYml = this.ymlFiles.filter(f => !f.isWorkflow);

        const def = document.createElement('option');
        def.value = '';
        def.textContent = `── Select YAML file (${this.ymlFiles.length} found) ──`;
        select.appendChild(def);

        if (workflowFiles.length > 0) {
            const grp = document.createElement('optgroup');
            grp.label = `⚙️  GitHub Actions Workflows (${workflowFiles.length})`;
            workflowFiles.sort((a, b) => a.path.localeCompare(b.path)).forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.path;
                opt.textContent = `${f.path}  @${this.branch}`;
                opt.dataset.isWorkflow = 'true';
                grp.appendChild(opt);
            });
            select.appendChild(grp);
        }

        if (otherYml.length > 0) {
            const grp = document.createElement('optgroup');
            grp.label = `📄  Other YAML Files (${otherYml.length})`;
            otherYml.sort((a, b) => a.path.localeCompare(b.path)).forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.path;
                opt.textContent = `${f.path}  @${this.branch}`;
                opt.dataset.isWorkflow = 'false';
                grp.appendChild(opt);
            });
            select.appendChild(grp);
        }

        this.elements.workflowRef.value = this.branch;
    }

    async onWorkflowFileSelect() {
        const path = this.elements.workflowFileSelect.value;
        this.elements.workflowFileInfo.innerHTML = '';
        this.elements.workflowInputsContainer.innerHTML = '';
        this.elements.workflowDispatchWarning.style.display = 'none';
        this.elements.triggerWorkflow.disabled = true;
        if (!path) return;

        try {
            this.showStatus('Loading workflow file...', 'info');
            const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}?ref=${this.branch}`;
            const response = await fetch(url, {
                headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json' }
            });
            if (!response.ok) throw new Error('Failed to fetch file');

            const data = await response.json();
            const content = this.decodeBase64(data.content.replace(/\n/g, ''));
            const info = this.parseWorkflowFile(content);

            this.elements.workflowFileInfo.innerHTML = this.buildWorkflowInfoHTML(path, info);

            const isWorkflowDir = path.toLowerCase().startsWith('.github/workflows/');
            const hasDispatch = info.triggers.includes('workflow_dispatch');

            if (!isWorkflowDir) {
                this.elements.workflowDispatchWarning.innerHTML =
                    '⚠️ Not in <code>.github/workflows/</code> — cannot be triggered as an Actions workflow.';
                this.elements.workflowDispatchWarning.style.display = 'block';
            } else if (!hasDispatch) {
                this.elements.workflowDispatchWarning.innerHTML =
                    '⚠️ No <code>workflow_dispatch</code> trigger found. Add it to the <code>on:</code> block.';
                this.elements.workflowDispatchWarning.style.display = 'block';
            } else {
                this.elements.triggerWorkflow.disabled = false;
                if (info.inputs.length > 0) {
                    this.elements.workflowInputsContainer.innerHTML = this.buildInputsHTML(info.inputs);
                }
            }
            this.showStatus('Workflow loaded', 'success');
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
        }
    }

    // ─── Shared Workflow Helpers ──────────────────────────────────────────────

    parseWorkflowFile(content) {
        const info = { name: 'Unknown', triggers: [], inputs: [] };

        const nameMatch = content.match(/^name:\s*['"]?(.+?)['"]?\s*$/m);
        if (nameMatch) info.name = nameMatch[1].trim();

        const onInline = content.match(/^on:\s*\[([^\]]+)\]/m);
        const onSingle = content.match(/^on:\s+(\w[\w_]+)\s*$/m);
        const onBlock  = content.match(/^on:\s*\n([\s\S]*?)(?=\n\S)/m);

        if (onInline) {
            info.triggers = onInline[1].split(',').map(t => t.trim());
        } else if (onSingle) {
            info.triggers = [onSingle[1].trim()];
        } else if (onBlock) {
            info.triggers = [...onBlock[1].matchAll(/^\s{2}(\w[\w_]+)\s*:/gm)].map(m => m[1]);
        }
        if (!info.triggers.includes('workflow_dispatch') && content.includes('workflow_dispatch')) {
            info.triggers.push('workflow_dispatch');
        }

        const dispatchBlock = content.match(/workflow_dispatch:\s*\n([\s\S]*?)(?=\n\s{2}[a-z_]+:|\njobs:|\Z)/);
        if (dispatchBlock) {
            const inputsBlock = dispatchBlock[1].match(/inputs:\s*\n([\s\S]*)/);
            if (inputsBlock) {
                const section = inputsBlock[1];
                const nameRe = /^[ ]{6}(\w+):\s*$/gm;
                let m;
                while ((m = nameRe.exec(section)) !== null) {
                    const name = m[1];
                    const start = m.index + m[0].length;
                    const nextIdx = section.slice(start).search(/^[ ]{6}\w+:/m);
                    const block = nextIdx >= 0 ? section.slice(start, start + nextIdx) : section.slice(start);

                    const desc    = (block.match(/description:\s*['"]?(.+?)['"]?\s*$/) || [])[1] || '';
                    const req     = (block.match(/required:\s*(true|false)/)            || [])[1] === 'true';
                    const def     = (block.match(/default:\s*['"]?(.+?)['"]?\s*$/)     || [])[1] || '';
                    const type    = (block.match(/type:\s*(\w+)/)                      || [])[1] || 'string';
                    const options = [];

                    const optBlock = block.match(/options:\s*\n([\s\S]*?)(?=\n[ ]{6,8}\w+:|\Z)/);
                    if (optBlock) {
                        for (const ov of optBlock[1].matchAll(/^\s+-\s*['"]?(.+?)['"]?\s*$/gm)) {
                            options.push(ov[1]);
                        }
                    }
                    info.inputs.push({ name, description: desc, required: req, default: def, type, options });
                }
            }
        }
        return info;
    }

    buildWorkflowInfoHTML(path, info) {
        const triggersHtml = info.triggers.map(t => {
            const cls = { workflow_dispatch: 'dispatch', push: 'push', pull_request: 'pull_request', schedule: 'schedule' }[t] || 'other';
            return `<span class="trigger-badge ${cls}">${t}</span>`;
        }).join(' ');

        return `
            <div class="file-path">📄 ${path}</div>
            <div class="file-details">
                <strong>Name:</strong> ${info.name}<br>
                <strong>Branch:</strong> ${this.branch}<br>
                <strong>Triggers:</strong> ${triggersHtml || '<span class="muted">none detected</span>'}
                ${info.inputs.length > 0 ? `<br><strong>Inputs:</strong> ${info.inputs.length} defined` : ''}
            </div>`;
    }

    buildInputsHTML(inputs) {
        let html = `<h4 style="margin-bottom:10px;color:#8b949e;">Workflow Inputs</h4>`;
        inputs.forEach(input => {
            html += `<div class="workflow-input-group">
                <label>${input.name}${input.required ? ' <span style="color:#f85149">*required</span>' : ''}</label>`;
            if (input.type === 'choice' && input.options.length > 0) {
                html += `<select data-input-name="${input.name}">
                    <option value="">Select…</option>
                    ${input.options.map(o => `<option value="${o}" ${o === input.default ? 'selected' : ''}>${o}</option>`).join('')}
                </select>`;
            } else if (input.type === 'boolean') {
                html += `<label class="checkbox-label">
                    <input type="checkbox" data-input-name="${input.name}" ${input.default === 'true' ? 'checked' : ''}>
                    ${input.description || 'Enable'}
                </label>`;
            } else {
                html += `<input type="text" data-input-name="${input.name}"
                    placeholder="${input.default || input.description || ''}"
                    value="${input.default || ''}">`;
            }
            if (input.description && input.type !== 'boolean') {
                html += `<small>${input.description}</small>`;
            }
            html += `</div>`;
        });
        return html;
    }

    collectInputs(container) {
        const inputs = {};
        container.querySelectorAll('[data-input-name]').forEach(el => {
            const name = el.dataset.inputName;
            if (el.type === 'checkbox') inputs[name] = String(el.checked);
            else if (el.value.trim()) inputs[name] = el.value.trim();
        });
        return inputs;
    }

    // ─── File Tree ────────────────────────────────────────────────────────────

    async loadBranches() {
        try {
            const r = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/branches`,
                { headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json' } }
            );
            if (!r.ok) return;
            const branches = await r.json();
            this.elements.pagesBranch.innerHTML = '<option value="">Select branch</option>';
            branches.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.name; opt.textContent = b.name;
                this.elements.pagesBranch.appendChild(opt);
            });
        } catch (e) { console.error(e); }
    }

    updateQuickLinks() {
        const base = `https://github.com/${this.owner}/${this.repo}`;
        this.elements.repoUrl.href = base;
        this.elements.repoUrl.classList.remove('disabled');
        this.elements.pagesSettingsUrl.href = `${base}/settings/pages`;
        this.elements.pagesSettingsUrl.classList.remove('disabled');
        this.elements.actionsPageLink.href = `${base}/actions`;
        this.elements.actionsPageLink.classList.remove('disabled');
        this.elements.actionsPageLinkPages.href = `${base}/actions`;
        this.elements.actionsPageLinkPages.classList.remove('disabled');
    }

    organizeFiles(tree) {
        const organized = {};
        tree.forEach(item => {
            if (item.type !== 'blob') return;
            const parts = item.path.split('/');
            let cur = organized;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!cur[parts[i]]) cur[parts[i]] = {};
                cur = cur[parts[i]];
            }
            cur[parts[parts.length - 1]] = { path: item.path, sha: item.sha, size: item.size };
        });
        return organized;
    }

    renderFileTree() {
        this.elements.fileTree.innerHTML = '';
        this.renderTreeLevel(this.files, this.elements.fileTree, '');
    }

    renderTreeLevel(level, container, prefix) {
        const folders = [], files = [];
        Object.keys(level).forEach(k => (level[k].path ? files : folders).push(k));

        folders.sort().forEach(key => {
            const folderDiv = document.createElement('div');
            folderDiv.className = 'folder-item';
            folderDiv.textContent = `📁 ${key}`;
            const contentDiv = document.createElement('div');
            contentDiv.className = 'folder-content';
            contentDiv.style.display = 'none';
            folderDiv.addEventListener('click', e => {
                e.stopPropagation();
                const hidden = contentDiv.style.display === 'none';
                contentDiv.style.display = hidden ? 'block' : 'none';
                folderDiv.textContent = `${hidden ? '📂' : '📁'} ${key}`;
            });
            container.appendChild(folderDiv);
            container.appendChild(contentDiv);
            this.renderTreeLevel(level[key], contentDiv, prefix ? `${prefix}/${key}` : key);
        });

        files.sort().forEach(key => {
            const item = level[key];
            const fileDiv = document.createElement('div');
            fileDiv.className = 'file-item';
            fileDiv.dataset.path = item.path;
            if (this.pendingUploads[item.path]) fileDiv.classList.add('has-changes');
            fileDiv.textContent = `${this.getFileIcon(key)} ${key}`;
            fileDiv.addEventListener('click', () => this.loadFile(item.path));
            container.appendChild(fileDiv);
        });
    }

    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        return {
            js:'📜', ts:'📘', json:'📋', html:'🌐', css:'🎨',
            md:'📝', yml:'⚙️', yaml:'⚙️', py:'🐍', rb:'💎',
            go:'🔵', rs:'🦀', java:'☕', php:'🐘', sh:'💻',
            txt:'📄', svg:'🖼️', png:'🖼️', jpg:'🖼️', gif:'🖼️'
        }[ext] || '📄';
    }

    // ─── File Load ────────────────────────────────────────────────────────────

    async loadFile(path) {
        try {
            if (this.pendingUploads[path] !== undefined) {
                this.elements.editor.value = this.pendingUploads[path];
                this.elements.editor.disabled = false;
                this.currentFile = path;
                this.elements.currentFile.textContent = `${path} ✏️ (unsaved)`;
                this.elements.fileInfo.textContent = 'Loaded from local cache — not pushed yet';
                this.elements.saveFile.disabled = false;
                this.elements.deleteFile.disabled = false;
                this.elements.exportCurrent.disabled = false;
                document.querySelectorAll('.file-item').forEach(el =>
                    el.classList.toggle('active', el.dataset.path === path));
                this.showStatus('Loaded from cache', 'info');
                return;
            }

            this.showStatus('Loading file...', 'info');
            const response = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}?ref=${this.branch}`,
                { headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json' } }
            );
            if (!response.ok) throw new Error(`Failed to load file: ${response.statusText}`);

            const data = await response.json();
            if (this.isBinaryFile(path)) {
                this.elements.editor.value = `[Binary file — ${data.size} bytes]`;
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

            document.querySelectorAll('.file-item').forEach(el =>
                el.classList.toggle('active', el.dataset.path === path));
            this.showStatus('File loaded', 'success');
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
        }
    }

    isBinaryFile(path) {
        const bin = ['png','jpg','jpeg','gif','bmp','ico','webp','pdf','zip','tar',
                     'gz','exe','dll','so','woff','woff2','ttf','eot','mp3','mp4','wav','avi','mov','webm'];
        return bin.includes(path.split('.').pop().toLowerCase());
    }

    // ─── Editor ───────────────────────────────────────────────────────────────

    createNewFile() {
        const fileName = prompt('Enter file name (with path if needed):');
        if (!fileName) return;
        this.currentFile = fileName;
        this.pendingUploads[fileName] = '';
        this.fileContents[fileName] = '';
        this.elements.editor.value = '';
        this.elements.editor.disabled = false;
        this.elements.currentFile.textContent = `${fileName} ✏️ (new)`;
        this.elements.fileInfo.textContent = 'New file — saved to cache';
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
        this.elements.fileInfo.textContent = '✏️ Modified — saved to local cache';
        clearTimeout(this._cacheTimer);
        this._cacheTimer = setTimeout(() => this.saveEditsToCache(), 800);
        const item = document.querySelector(`.file-item[data-path="${this.currentFile}"]`);
        if (item) item.classList.add('has-changes');
    }

    async saveCurrentFile() {
        if (!this.currentFile) { this.showStatus('No file selected', 'error'); return; }
        const content = this.elements.editor.value;
        const message = prompt('Commit message:', `Update ${this.currentFile}`);
        if (!message) return;

        try {
            this.showStatus('Saving to GitHub...', 'info');
            const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(this.currentFile)}`;
            const body = { message, content: this.encodeBase64(content), branch: this.branch };
            if (this.fileSHAs[this.currentFile]) body.sha = this.fileSHAs[this.currentFile];

            const response = await fetch(url, {
                method: 'PUT',
                headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!response.ok) { const e = await response.json(); throw new Error(e.message || response.statusText); }

            const data = await response.json();
            this.fileSHAs[this.currentFile] = data.content.sha;
            this.fileContents[this.currentFile] = content;
            delete this.pendingUploads[this.currentFile];
            this.saveEditsToCache();

            this.showStatus('File pushed to GitHub!', 'success');
            this.elements.fileInfo.textContent = `Saved | SHA: ${data.content.sha.substring(0, 7)}`;
            this.elements.currentFile.textContent = this.currentFile;
            this.updatePendingList();
            await this.fetchRepositoryTree();
            this.populateWorkflowDropdown();
            this.populateDeployDropdown();
        } catch (error) { this.showStatus(`Error: ${error.message}`, 'error'); }
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
            const response = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(this.currentFile)}`,
                {
                    method: 'DELETE',
                    headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message, sha: this.fileSHAs[this.currentFile], branch: this.branch })
                }
            );
            if (!response.ok) throw new Error(`Failed to delete: ${response.statusText}`);

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
            this.showStatus('File deleted', 'success');
            await this.fetchRepositoryTree();
            this.populateWorkflowDropdown();
            this.populateDeployDropdown();
        } catch (error) { this.showStatus(`Error: ${error.message}`, 'error'); }
    }

    // ─── Import / Export ──────────────────────────────────────────────────────

    async handleFileImport(event) {
        const files = event.target.files;
        if (!files.length) return;
        for (const f of files) await this.importSingleFile(f, f.name);
        event.target.value = '';
        this.saveEditsToCache();
        this.updatePendingList();
        this.showStatus(`${files.length} file(s) imported and cached`, 'success');
    }

    async handleFolderImport(event) {
        const files = event.target.files;
        if (!files.length) return;
        for (const f of files) await this.importSingleFile(f, f.webkitRelativePath || f.name);
        event.target.value = '';
        this.saveEditsToCache();
        this.updatePendingList();
        this.showStatus(`${files.length} file(s) imported and cached`, 'success');
    }

    importSingleFile(file, path) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => {
                this.pendingUploads[path] = e.target.result;
                this.fileContents[path] = e.target.result;
                resolve();
            };
            reader.readAsText(file);
        });
    }

    updatePendingList() {
        const paths = Object.keys(this.pendingUploads);
        this.elements.batchCommitBtn.disabled = paths.length === 0;

        if (paths.length === 0) {
            this.elements.pendingImports.innerHTML = '<p class="muted">No pending changes</p>';
            this.updateCacheIndicator();
            return;
        }

        this.elements.pendingImports.innerHTML = `
            <h4>Pending / Cached Changes (${paths.length})</h4>
            ${paths.map(p => `
                <div class="pending-item">
                    <span>${p}</span>
                    <button class="remove-btn" data-path="${p}">✕ Remove</button>
                </div>`).join('')}`;

        this.elements.pendingImports.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                delete this.pendingUploads[btn.dataset.path];
                this.saveEditsToCache();
                this.updatePendingList();
                this.renderFileTree();
            });
        });
        this.updateCacheIndicator();
    }

    exportCurrentFile() {
        if (!this.currentFile) { this.showStatus('No file selected', 'error'); return; }
        this.downloadFile(this.currentFile.split('/').pop(), this.elements.editor.value);
        this.showStatus('File exported', 'success');
    }

    async exportAllFiles() {
        if (!this.owner || !this.repo) { this.showStatus('Load a repository first', 'error'); return; }
        this.showStatus('Exporting...', 'info');
        try {
            const exportData = { repository: `${this.owner}/${this.repo}`, branch: this.branch, exportDate: new Date().toISOString(), files: {} };
            let loaded = 0;
            for (const item of this.fileTree) {
                if (this.isBinaryFile(item.path)) continue;
                try {
                    const r = await fetch(
                        `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(item.path)}?ref=${this.branch}`,
                        { headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json' } }
                    );
                    if (r.ok) {
                        const d = await r.json();
                        exportData.files[item.path] = this.decodeBase64(d.content.replace(/\n/g, ''));
                    }
                } catch (e) { console.error(e); }
                loaded++;
                if (loaded % 10 === 0) this.showStatus(`Exporting ${loaded}/${this.fileTree.length}...`, 'info');
            }
            this.downloadFile(`${this.repo}-export.json`, JSON.stringify(exportData, null, 2));
            this.showStatus(`Exported ${Object.keys(exportData.files).length} files`, 'success');
        } catch (error) { this.showStatus(`Export failed: ${error.message}`, 'error'); }
    }

    downloadRepoZip() {
        if (!this.owner || !this.repo) { this.showStatus('Load a repository first', 'error'); return; }
        window.open(`https://github.com/${this.owner}/${this.repo}/archive/refs/heads/${this.branch}.zip`, '_blank');
    }

    downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: filename });
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    }

    async batchCommit() {
        const paths = Object.keys(this.pendingUploads);
        if (paths.length === 0) { this.showStatus('No pending changes', 'error'); return; }
        const message = this.elements.batchCommitMessage.value.trim() || 'Update files';
        if (!confirm(`Push ${paths.length} file(s) to GitHub?\n"${message}"`)) return;

        let saved = 0, failed = 0;
        for (const [path, content] of Object.entries(this.pendingUploads)) {
            this.showStatus(`Pushing ${saved + 1}/${paths.length}: ${path}`, 'info');
            try {
                const body = { message, content: this.encodeBase64(content), branch: this.branch };
                if (this.fileSHAs[path]) body.sha = this.fileSHAs[path];
                const r = await fetch(
                    `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}`,
                    { method: 'PUT', headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
                );
                if (r.ok) {
                    const d = await r.json();
                    this.fileSHAs[path] = d.content.sha;
                    delete this.pendingUploads[path];
                    saved++;
                } else { failed++; }
            } catch (e) { failed++; console.error(e); }
        }

        if (Object.keys(this.pendingUploads).length === 0) {
            this.clearRepoCache();
        } else {
            this.saveEditsToCache();
        }

        this.updatePendingList();
        this.showStatus(
            failed === 0
                ? `✅ Pushed ${saved} file(s)! Cache cleared.`
                : `Pushed ${saved}, failed ${failed}. Failures remain in cache.`,
            failed === 0 ? 'success' : 'error'
        );

        await this.fetchRepositoryTree();
        this.populateWorkflowDropdown();
        this.populateDeployDropdown();
    }

    // ─── GitHub Pages ─────────────────────────────────────────────────────────

    async loadPagesInfo() {
        if (!this.owner || !this.repo) { this.showStatus('Load a repository first', 'error'); return; }
        this.showStatus('Loading Pages info...', 'info');
        try {
            const r = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/pages`,
                { headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json' } }
            );
            if (r.ok) {
                const data = await r.json();
                this.displayPagesStatus(data);
                // Auto-set source type toggle
                if (data.build_type === 'workflow') {
                    this.elements.pagesSourceType.value = 'actions';
                    this.onSourceTypeChange();
                }
            } else if (r.status === 404) {
                this.elements.pagesStatus.innerHTML = `
                    <div class="status-row">
                        <span class="status-label">Status</span>
                        <span class="status-value inactive">Not Enabled</span>
                    </div>`;
                this.elements.pagesUrl.classList.add('disabled');
            }
            await this.loadDeployments();
            this.showStatus('Pages info loaded', 'success');
        } catch (error) { this.showStatus(`Error: ${error.message}`, 'error'); }
    }

    displayPagesStatus(data) {
        const buildType = data.build_type || 'legacy';
        this.elements.pagesStatus.innerHTML = `
            <div class="status-row">
                <span class="status-label">Status</span>
                <span class="status-value ${data.status === 'built' ? 'active' : ''}">${data.status || 'Unknown'}</span>
            </div>
            <div class="status-row">
                <span class="status-label">Build Type</span>
                <span class="status-value">${buildType === 'workflow' ? '⚙️ GitHub Actions' : '🌿 Branch'}</span>
            </div>
            <div class="status-row">
                <span class="status-label">URL</span>
                <span class="status-value"><a href="${data.html_url}" target="_blank">${data.html_url}</a></span>
            </div>
            ${data.source ? `
            <div class="status-row">
                <span class="status-label">Source</span>
                <span class="status-value">${data.source.branch} / ${data.source.path || '/'}</span>
            </div>` : ''}`;

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
            const r = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/deployments`,
                { headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json' } }
            );
            if (!r.ok) return;
            const deps = await r.json();
            this.elements.deploymentsList.innerHTML = deps.length === 0
                ? '<p class="muted">No deployments found</p>'
                : deps.slice(0, 5).map(d => `
                    <div class="deployment-item">
                        <div>
                            <span class="workflow-name">${d.environment}</span>
                            <div class="workflow-path">${d.ref} • ${new Date(d.created_at).toLocaleDateString()}</div>
                        </div>
                    </div>`).join('');
        } catch (e) { console.error(e); }
    }

    async enablePages() {
        const sourceType = this.elements.pagesSourceType.value;
        try {
            this.showStatus('Updating Pages config...', 'info');
            let body;
            if (sourceType === 'actions') {
                body = { build_type: 'workflow' };
            } else {
                const branch = this.elements.pagesBranch.value;
                const path = this.elements.pagesPath.value;
                if (!branch) { this.showStatus('Select a branch', 'error'); return; }
                body = { build_type: 'legacy', source: { branch, path } };
            }

            // Try PUT (update) first, then POST (create)
            let r = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/pages`,
                {
                    method: 'PUT',
                    headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                }
            );
            if (r.status === 404 || r.status === 405) {
                r = await fetch(
                    `https://api.github.com/repos/${this.owner}/${this.repo}/pages`,
                    {
                        method: 'POST',
                        headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    }
                );
            }
            if (!r.ok) {
                const e = await r.json();
                throw new Error(e.message || r.statusText);
            }
            this.showStatus('Pages configuration updated!', 'success');
            await this.loadPagesInfo();
        } catch (error) { this.showStatus(`Error: ${error.message}`, 'error'); }
    }

    async disablePages() {
        if (!confirm('Disable GitHub Pages for this repository?')) return;
        try {
            this.showStatus('Disabling Pages...', 'info');
            const r = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/pages`,
                { method: 'DELETE', headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json' } }
            );
            if (!r.ok && r.status !== 204) throw new Error('Failed to disable Pages');
            this.showStatus('Pages disabled', 'success');
            await this.loadPagesInfo();
        } catch (error) { this.showStatus(`Error: ${error.message}`, 'error'); }
    }

    // ─── GitHub Actions ───────────────────────────────────────────────────────

    async loadActionsInfo() {
        if (!this.owner || !this.repo) { this.showStatus('Load a repository first', 'error'); return; }
        this.showStatus('Loading Actions...', 'info');
        try {
            const r = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/actions/workflows`,
                { headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json' } }
            );
            if (r.ok) {
                this.workflows = (await r.json()).workflows || [];
                this.displayRegisteredWorkflows();
            }
            await this.loadWorkflowRuns();
            this.showStatus('Actions loaded', 'success');
        } catch (error) { this.showStatus(`Error: ${error.message}`, 'error'); }
    }

    displayRegisteredWorkflows() {
        this.elements.workflowsList.innerHTML = this.workflows.length === 0
            ? '<p class="muted">No registered workflows found</p>'
            : this.workflows.map(wf => `
                <div class="workflow-item">
                    <div>
                        <div class="workflow-name">${wf.name}</div>
                        <div class="workflow-path">${wf.path}</div>
                    </div>
                    <span class="run-status ${wf.state}">${wf.state}</span>
                </div>`).join('');
    }

    async loadWorkflowRuns() {
        try {
            const r = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/actions/runs?per_page=10`,
                { headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json' } }
            );
            if (!r.ok) return;
            const runs = (await r.json()).workflow_runs || [];
            this.elements.workflowRuns.innerHTML = runs.length === 0
                ? '<p class="muted">No recent runs</p>'
                : runs.map(run => `
                    <div class="run-item">
                        <div>
                            <div class="run-name">${run.name}</div>
                            <div class="workflow-path">${run.head_branch} • ${new Date(run.created_at).toLocaleDateString()}</div>
                        </div>
                        <span class="run-status ${run.conclusion || run.status}">${run.conclusion || run.status}</span>
                    </div>`).join('');
        } catch (e) { console.error(e); }
    }

    async triggerWorkflow() {
        const path = this.elements.workflowFileSelect.value;
        if (!path) { this.showStatus('Select a workflow file', 'error'); return; }

        const ref = this.elements.workflowRef.value.trim() || this.branch;
        const workflowFileName = path.split('/').pop();
        const inputs = this.collectInputs(this.elements.workflowInputsContainer);

        try {
            this.showStatus('Triggering workflow...', 'info');
            const body = { ref };
            if (Object.keys(inputs).length > 0) body.inputs = inputs;

            const r = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/actions/workflows/${workflowFileName}/dispatches`,
                {
                    method: 'POST',
                    headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                }
            );
            if (!r.ok) { const e = await r.json(); throw new Error(e.message || r.statusText); }
            this.showStatus('Workflow triggered!', 'success');
            if (confirm('Open GitHub Actions page?')) {
                window.open(`https://github.com/${this.owner}/${this.repo}/actions`, '_blank');
            }
            setTimeout(() => this.loadWorkflowRuns(), 3000);
        } catch (error) { this.showStatus(`Error: ${error.message}`, 'error'); }
    }

    // ─── Status Toast ─────────────────────────────────────────────────────────

    showStatus(message, type) {
        this.elements.status.textContent = message;
        this.elements.status.className = `status ${type}`;
        if (type !== 'info') {
            setTimeout(() => { this.elements.status.className = 'status'; }, 4000);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.editor = new GitHubEditor();
});