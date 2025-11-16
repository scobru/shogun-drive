import { DriveCore } from '../lib/drive-core.js';

export class FileGrid {
  constructor(options = {}) {
    this.files = options.files || [];
    this.filteredFiles = this.files;
    this.onFileClick = options.onFileClick || (() => {});
    this.onFileDelete = options.onFileDelete || (() => {});
    this.onFileDownload = options.onFileDownload || (() => {});
    this.driveCore = new DriveCore();
  }

  render() {
    const container = document.createElement('div');
    container.className = 'file-grid-container';
    this.container = container;
    this.updateFiles(this.files);
    return container;
  }

  updateFiles(files) {
    this.files = files;
    this.filteredFiles = files;
    this.renderGrid();
  }

  filter(searchTerm) {
    if (!searchTerm) {
      this.filteredFiles = this.files;
    } else {
      const term = searchTerm.toLowerCase();
      this.filteredFiles = this.files.filter(file => 
        file.name.toLowerCase().includes(term) ||
        file.originalName.toLowerCase().includes(term) ||
        file.cid.toLowerCase().includes(term)
      );
    }
    this.renderGrid();
  }

  renderGrid() {
    if (!this.container) return;

    if (this.filteredFiles.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" class="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3>No files found</h3>
          <p>Upload your first file to get started</p>
        </div>
      `;
      return;
    }

    this.container.innerHTML = `
      <div class="file-grid">
        ${this.filteredFiles.map(file => this.renderFileCard(file)).join('')}
      </div>
    `;

    // Aggiungi event listeners
    this.container.querySelectorAll('.file-card').forEach(card => {
      const cid = card.dataset.cid;
      const file = this.filteredFiles.find(f => f.cid === cid);
      
      card.querySelector('.file-card-content').addEventListener('click', () => {
        this.onFileClick(file);
      });

      card.querySelector('.file-download-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.onFileDownload(file);
      });

      card.querySelector('.file-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.onFileDelete(file);
      });
    });
  }

  renderFileCard(file) {
    const icon = this.driveCore.getFileIcon(file.type);
    const size = this.driveCore.formatBytes(file.size);
    // Assicurati che la data sia valida (non futura)
    const uploadedAt = file.uploadedAt || Date.now();
    const uploadDate = new Date(uploadedAt);
    // Se la data è futura o invalida, usa la data corrente
    const validDate = (uploadDate.getTime() > Date.now() || isNaN(uploadDate.getTime())) 
      ? new Date() 
      : uploadDate;
    const date = validDate.toLocaleDateString();
    const encryptedBadge = file.isEncrypted ? '<span class="encrypted-badge">🔒 Encrypted</span>' : '';

    return `
      <div class="file-card" data-cid="${file.cid}">
        <div class="file-card-content">
          <div class="file-icon">${icon}</div>
          <div class="file-info">
            <div class="file-name" title="${file.name}">${this.truncate(file.name, 30)}</div>
            <div class="file-meta">
              <span>${size}</span>
              <span>•</span>
              <span>${date}</span>
            </div>
            ${encryptedBadge}
          </div>
        </div>
        <div class="file-actions">
          <button class="file-action-btn file-download-btn" title="Download">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button class="file-action-btn file-delete-btn" title="Delete">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  truncate(str, maxLength) {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }
}

