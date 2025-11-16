import { DriveCore } from '../lib/drive-core.js';
import { FileGrid } from './FileGrid.js';
import { UploadArea } from './UploadArea.js';
import { SettingsPanel } from './SettingsPanel.js';

export class DriveApp {
  constructor() {
    this.driveCore = new DriveCore({
      onProgress: (progress) => this.handleProgress(progress),
      onStatusChange: (status) => this.handleStatusChange(status)
    });
    
    this.files = [];
    this.isLoading = false;
    this.currentStatus = null;
    this.authToken = localStorage.getItem('shogun-drive-token') || '';
    this.relayUrl = localStorage.getItem('shogun-drive-relay-url') || window.location.origin;
    this.encryptionToken = localStorage.getItem('shogun-drive-encryption-token') || '';
    this.isConnected = false;
    this.isAuthenticated = false;
    
    if (this.authToken) {
      this.driveCore.setAuthToken(this.authToken);
      this.driveCore.relayUrl = this.relayUrl;
    }
    if (this.encryptionToken) {
      this.driveCore.setEncryptionToken(this.encryptionToken);
    }
    
    // Initialize theme from localStorage
    this.initTheme();
  }

  initTheme() {
    const savedTheme = localStorage.getItem('shogun-drive-theme') || 'shogun-dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  async init() {
    // Verifica connessione e autenticazione
    await this.checkConnection();
    
    if (this.authToken && this.isConnected && this.isAuthenticated) {
      await this.loadFiles();
    } else if (this.authToken) {
      this.showStatus('Please check your connection and authentication settings', 'warning');
    }
  }

  async checkConnection() {
    if (!this.authToken) {
      this.isConnected = false;
      this.isAuthenticated = false;
      this.updateConnectionStatus();
      return;
    }

    try {
      this.isConnected = await this.driveCore.checkRelayConnection();
      this.isAuthenticated = await this.driveCore.checkAuthentication();
      this.updateConnectionStatus();
    } catch (error) {
      console.error('Connection check error:', error);
      this.isConnected = false;
      this.isAuthenticated = false;
      this.updateConnectionStatus();
    }
  }

  updateConnectionStatus() {
    if (!this.container) return;

    const statusIndicator = this.container.querySelector('#connectionStatus');
    if (statusIndicator) {
      if (this.isConnected && this.isAuthenticated) {
        statusIndicator.className = 'connection-status connected';
        statusIndicator.textContent = '● Connected';
        statusIndicator.title = 'Connected and authenticated';
      } else if (this.isConnected) {
        statusIndicator.className = 'connection-status warning';
        statusIndicator.textContent = '● Auth Failed';
        statusIndicator.title = 'Connected but authentication failed';
      } else {
        statusIndicator.className = 'connection-status disconnected';
        statusIndicator.textContent = '● Disconnected';
        statusIndicator.title = 'Cannot connect to relay server';
      }
    }
  }

  render() {
    const container = document.createElement('div');
    container.className = 'drive-app';
    container.innerHTML = `
      <div class="drive-header">
        <div class="header-left">
          <h1 class="drive-title">Shogun Drive</h1>
          <p class="drive-subtitle">Decentralized Encrypted File Storage</p>
        </div>
        <div class="header-right">
          <span id="connectionStatus" class="connection-status disconnected" title="Connection status">● Checking...</span>
          <button id="themeToggleBtn" class="btn-icon" title="Toggle Theme">
            <svg id="sunIcon" xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="display: none;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <svg id="moonIcon" xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          </button>
          <button id="settingsBtn" class="btn-icon" title="Settings">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button id="refreshBtn" class="btn-icon" title="Refresh">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <div class="drive-toolbar">
        <div class="toolbar-left">
          <button id="uploadBtn" class="btn-primary">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload Files
          </button>
        </div>
        <div class="toolbar-right">
          <div class="search-box">
            <svg xmlns="http://www.w3.org/2000/svg" class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" id="searchInput" placeholder="Search files..." />
          </div>
        </div>
      </div>

      <div id="statusBar" class="status-bar" style="display: none;"></div>

      <div class="drive-content">
        <div id="fileGridContainer"></div>
        <div id="uploadAreaContainer"></div>
        <div id="settingsPanelContainer" style="display: none;"></div>
      </div>
    `;

    // Inizializza componenti
    this.fileGrid = new FileGrid({
      files: this.files,
      onFileClick: (file) => this.handleFileClick(file),
      onFileDelete: (file) => this.handleFileDelete(file),
      onFileDownload: (file) => this.handleFileDownload(file)
    });

    this.uploadArea = new UploadArea({
      onUpload: (files) => this.handleUpload(files),
      onDragOver: () => this.handleDragOver(),
      onDragLeave: () => this.handleDragLeave()
    });

    this.settingsPanel = new SettingsPanel({
      authToken: this.authToken,
      relayUrl: this.relayUrl,
      encryptionToken: this.encryptionToken,
      onSave: (settings) => this.handleSettingsSave(settings)
    });

    const fileGridContainer = container.querySelector('#fileGridContainer');
    const uploadAreaContainer = container.querySelector('#uploadAreaContainer');
    const settingsPanelContainer = container.querySelector('#settingsPanelContainer');

    fileGridContainer.appendChild(this.fileGrid.render());
    uploadAreaContainer.appendChild(this.uploadArea.render());
    settingsPanelContainer.appendChild(this.settingsPanel.render());

    // Event listeners
    container.querySelector('#uploadBtn').addEventListener('click', () => {
      this.uploadArea.show();
    });

    container.querySelector('#refreshBtn').addEventListener('click', async () => {
      await this.checkConnection();
      await this.loadFiles();
    });

    container.querySelector('#settingsBtn').addEventListener('click', () => {
      this.toggleSettings();
    });

    container.querySelector('#themeToggleBtn').addEventListener('click', () => {
      this.toggleTheme();
    });

    container.querySelector('#searchInput').addEventListener('input', (e) => {
      this.fileGrid.filter(e.target.value);
    });

    this.container = container;
    
    // Update theme icons based on current theme
    this.updateThemeIcons();
    
    // Inizializza dopo che il container è stato creato
    this.init();
    
    return container;
  }

  async loadFiles() {
    if (!this.authToken) {
      this.showStatus('Please configure your auth token in settings', 'warning');
      return;
    }

    // Verifica connessione prima di caricare i file
    if (!this.isConnected || !this.isAuthenticated) {
      this.showStatus('Not connected or authenticated. Please check your settings.', 'warning');
      await this.checkConnection();
      if (!this.isConnected || !this.isAuthenticated) {
        return;
      }
    }

    this.isLoading = true;
    this.showStatus('Loading files...', 'info');

    try {
      this.files = await this.driveCore.getFileList();
      this.fileGrid.updateFiles(this.files);
      if (this.files.length > 0) {
        this.showStatus(`Loaded ${this.files.length} file(s)`, 'success');
      } else {
        this.showStatus('No files found', 'info');
      }
    } catch (error) {
      const errorMessage = error.message || 'Unknown error';
      this.showStatus(`Error loading files: ${errorMessage}`, 'error');
      console.error('Error loading files:', error);
      
      // Aggiorna lo stato di connessione se c'è un errore
      await this.checkConnection();
    } finally {
      this.isLoading = false;
    }
  }

  async handleUpload(files) {
    if (!this.authToken) {
      this.showStatus('Please configure your auth token in settings', 'error');
      this.toggleSettings();
      this.uploadArea.hide();
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const file of files) {
      try {
        this.showStatus(`Uploading ${file.name}...`, 'info');
        await this.driveCore.uploadFile(file, { encrypt: true });
        successCount++;
        this.showStatus(`${file.name} uploaded successfully`, 'success');
      } catch (error) {
        errorCount++;
        this.showStatus(`Error uploading ${file.name}: ${error.message}`, 'error');
        console.error('Upload error:', error);
      }
    }

    // Nascondi l'area di upload dopo il completamento
    this.uploadArea.hide();

    // Ricarica i file solo se almeno un upload è riuscito
    // Aspetta un po' per dare tempo ai metadati di essere salvati in Gun
    if (successCount > 0) {
      try {
        // Aspetta 1 secondo per dare tempo a Gun di salvare i metadati
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.loadFiles();
      } catch (error) {
        console.error('Error reloading files:', error);
      }
    }

    // Mostra riepilogo
    if (successCount > 0 && errorCount === 0) {
      this.showStatus(`Successfully uploaded ${successCount} file(s)`, 'success');
    } else if (successCount > 0 && errorCount > 0) {
      this.showStatus(`Uploaded ${successCount} file(s), ${errorCount} failed`, 'warning');
    } else if (errorCount > 0) {
      this.showStatus(`Failed to upload ${errorCount} file(s)`, 'error');
    }
  }

  async handleFileDownload(file) {
    try {
      this.showStatus(`Downloading ${file.name}...`, 'info');
      const blob = await this.driveCore.downloadFile(file.cid, file);
      
      // Rimuovi l'estensione .enc se presente nel nome del file
      let downloadName = file.originalName || file.name;
      if (file.isEncrypted && downloadName.endsWith('.enc')) {
        downloadName = downloadName.slice(0, -4); // Rimuovi .enc
      }
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Revoca l'URL dopo un breve delay per assicurarsi che il download sia iniziato
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);

      this.showStatus(`${downloadName} downloaded successfully`, 'success');
    } catch (error) {
      this.showStatus(`Error downloading ${file.name}: ${error.message}`, 'error');
      console.error('Download error:', error);
    }
  }

  async handleFileDelete(file) {
    if (!confirm(`Are you sure you want to delete "${file.name}"?`)) {
      return;
    }

    try {
      this.showStatus(`Deleting ${file.name}...`, 'info');
      await this.driveCore.deleteFile(file.cid);
      this.showStatus(`${file.name} deleted successfully`, 'success');
      // Aspetta un po' prima di ricaricare per dare tempo al relay di aggiornare
      await new Promise(resolve => setTimeout(resolve, 500));
      await this.loadFiles();
    } catch (error) {
      this.showStatus(`Error deleting ${file.name}: ${error.message}`, 'error');
    }
  }

  handleFileClick(file) {
    // Preview o apri file
    // Assicurati che il relayUrl includa il token se il file è criptato
    let url = file.relayUrl;
    if (file.isEncrypted && this.authToken && !url.includes('token=')) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}token=${encodeURIComponent(this.authToken)}`;
    }
    
    if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/')) {
      window.open(url, '_blank', 'noopener');
    } else {
      this.handleFileDownload(file);
    }
  }

  handleProgress(progress) {
    // Gestisci progresso upload/download
    if (progress.progress) {
      this.showStatus(`Progress: ${progress.progress}%`, 'info');
    }
  }

  handleStatusChange(status) {
    this.currentStatus = status;
    if (status.message) {
      this.showStatus(status.message, status.status === 'error' ? 'error' : 'info');
    }
  }

  async handleSettingsSave(settings) {
    this.authToken = settings.authToken;
    this.relayUrl = settings.relayUrl;
    this.encryptionToken = settings.encryptionToken || this.encryptionToken;
    
    localStorage.setItem('shogun-drive-token', this.authToken);
    localStorage.setItem('shogun-drive-relay-url', this.relayUrl);
    if (this.encryptionToken) {
      localStorage.setItem('shogun-drive-encryption-token', this.encryptionToken);
    } else {
      localStorage.removeItem('shogun-drive-encryption-token');
    }
    
    this.driveCore.setAuthToken(this.authToken);
    this.driveCore.relayUrl = this.relayUrl;
    if (this.encryptionToken) {
      this.driveCore.setEncryptionToken(this.encryptionToken);
    }
    
    this.toggleSettings();
    
    // Verifica connessione e autenticazione
    await this.checkConnection();
    
    if (this.isConnected && this.isAuthenticated) {
      await this.loadFiles();
    } else {
      this.showStatus('Please check your connection and authentication', 'warning');
    }
  }

  toggleSettings() {
    const panel = this.container.querySelector('#settingsPanelContainer');
    const grid = this.container.querySelector('#fileGridContainer');
    
    if (panel.style.display === 'none') {
      panel.style.display = 'block';
      grid.style.display = 'none';
    } else {
      panel.style.display = 'none';
      grid.style.display = 'block';
    }
  }

  handleDragOver() {
    this.uploadArea.show();
  }

  handleDragLeave() {
    // Gestisci drag leave se necessario
  }

  showStatus(message, type = 'info') {
    if (!this.container) {
      // Container non ancora creato, salva il messaggio per dopo
      console.log(`[${type.toUpperCase()}] ${message}`);
      return;
    }
    
    const statusBar = this.container.querySelector('#statusBar');
    if (!statusBar) {
      console.log(`[${type.toUpperCase()}] ${message}`);
      return;
    }
    
    statusBar.textContent = message;
    statusBar.className = `status-bar status-${type}`;
    statusBar.style.display = 'block';

    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        if (statusBar) {
          statusBar.style.display = 'none';
        }
      }, 3000);
    }
  }

  updateThemeIcons() {
    if (!this.container) return;
    
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const sunIcon = this.container.querySelector('#sunIcon');
    const moonIcon = this.container.querySelector('#moonIcon');
    
    if (currentTheme === 'shogun-light') {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    } else {
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    }
  }

  toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'shogun-dark' ? 'shogun-light' : 'shogun-dark';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('shogun-drive-theme', newTheme);
    
    // Update icons
    this.updateThemeIcons();
    
    this.showStatus(`Theme changed to ${newTheme === 'shogun-dark' ? 'Dark' : 'Light'} mode`, 'info');
  }
}

