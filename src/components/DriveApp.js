import { DriveCore } from "../lib/drive-core.js";
import { FileGrid } from "./FileGrid.js";
import { UploadArea } from "./UploadArea.js";
import { SettingsPanel } from "./SettingsPanel.js";

export class DriveApp {
  constructor() {
    this.driveCore = new DriveCore({
      onProgress: (progress) => this.handleProgress(progress),
      onStatusChange: (status) => this.handleStatusChange(status),
    });

    this.files = [];
    this.isLoading = false;
    this.currentStatus = null;
    this.authToken = localStorage.getItem("shogun-drive-token") || "";
    this.relayUrl =
      localStorage.getItem("shogun-drive-relay-url") || window.location.origin;
    this.encryptionToken =
      localStorage.getItem("shogun-drive-encryption-token") || "";
    this.isConnected = false;
    this.isAuthenticated = false;
    this.currentPath = []; // Array per tracciare il percorso di navigazione (stack di directory)
    this.currentDirectoryCid = null; // CID della directory corrente (null = root)

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
    const savedTheme = localStorage.getItem("shogun-drive-theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
  }

  async init() {
    // Verifica connessione e autenticazione
    await this.checkConnection();

    if (this.authToken && this.isConnected && this.isAuthenticated) {
      await this.loadFiles();
    } else if (this.authToken) {
      this.showStatus(
        "Please check your connection and authentication settings",
        "warning"
      );
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
      console.error("Connection check error:", error);
      this.isConnected = false;
      this.isAuthenticated = false;
      this.updateConnectionStatus();
    }
  }

  updateConnectionStatus() {
    if (!this.container) return;

    const statusIndicator = this.container.querySelector("#connectionStatus");
    if (statusIndicator) {
      if (this.isConnected && this.isAuthenticated) {
        statusIndicator.className = "connection-status connected";
        statusIndicator.textContent = "● Connected";
        statusIndicator.title = "Connected and authenticated";
      } else if (this.isConnected) {
        statusIndicator.className = "connection-status warning";
        statusIndicator.textContent = "● Auth Failed";
        statusIndicator.title = "Connected but authentication failed";
      } else {
        statusIndicator.className = "connection-status disconnected";
        statusIndicator.textContent = "● Disconnected";
        statusIndicator.title = "Cannot connect to relay server";
      }
    }
  }

  render() {
    const container = document.createElement("div");
    container.className = "drive-app";
    container.innerHTML = `
      <div class="drive-header">
        <div class="header-left">
          <img src="/logo.svg" alt="Drive" class="drive-logo" width="64" height="64">
          <div class="drive-title-wrapper">
            <h1 class="drive-title">Drive</h1>
          </div>
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
          <button id="uploadFolderBtn" class="btn-primary">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            Upload Folder
          </button>
          <div id="breadcrumb" class="breadcrumb" style="display: none;"></div>
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

      <footer class="w-full py-5 px-1 mt-auto">
        <div class="w-full">
          <ul class="menu menu-horizontal w-full">
            <div class="flex justify-center items-center gap-2 text-sm w-full">
              <div class="text-center">
                <a href="https://github.com/scobru/shogun-drive" target="_blank" rel="noreferrer" class="link">
                  Fork me
                </a>
              </div>
              <span>·</span>
              <div class="flex justify-center items-center gap-2">
                <p class="m-0 text-center">
                  Built with 
                  <svg xmlns="http://www.w3.org/2000/svg" class="inline-block h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                  at
                </p>
                <a
                  class="flex justify-center items-center gap-1"
                  href="https://shogun-eco.xyz/"
                  target="_blank"
                  rel="noreferrer"
                >
                  <span class="link">Shogun Ecosystem</span>
                </a>
                <span>·</span>
                <span class="text-center">by <a href="https://github.com/scobru" target="_blank" rel="noreferrer" class="link">scobru</a></span>
              </div>
              <span>·</span>
              <div class="text-center">
                <a href="https://t.me/shogun_eco" target="_blank" rel="noreferrer" class="link">
                  Support
                </a>
              </div>
            </div>
          </ul>
        </div>
      </footer>
    `;

    // Inizializza componenti
    this.fileGrid = new FileGrid({
      files: this.files,
      onFileClick: (file) => this.handleFileClick(file),
      onFileDelete: (file) => this.handleFileDelete(file),
      onFileDownload: (file) => this.handleFileDownload(file),
      onFolderClick: (folder) => this.handleFolderClick(folder),
    });

    this.uploadArea = new UploadArea({
      onUpload: (files) => this.handleUpload(files),
      onDragOver: () => this.handleDragOver(),
      onDragLeave: () => this.handleDragLeave(),
    });

    this.settingsPanel = new SettingsPanel({
      authToken: this.authToken,
      relayUrl: this.relayUrl,
      encryptionToken: this.encryptionToken,
      onSave: (settings) => this.handleSettingsSave(settings),
    });

    const fileGridContainer = container.querySelector("#fileGridContainer");
    const uploadAreaContainer = container.querySelector("#uploadAreaContainer");
    const settingsPanelContainer = container.querySelector(
      "#settingsPanelContainer"
    );

    fileGridContainer.appendChild(this.fileGrid.render());
    uploadAreaContainer.appendChild(this.uploadArea.render());
    settingsPanelContainer.appendChild(this.settingsPanel.render());

    // Event listeners
    container.querySelector("#uploadBtn").addEventListener("click", () => {
      this.uploadArea.show();
    });

    container
      .querySelector("#uploadFolderBtn")
      .addEventListener("click", () => {
        const folderInput =
          this.uploadArea.container.querySelector("#folderInput");
        if (folderInput) {
          folderInput.click();
        }
      });

    container
      .querySelector("#refreshBtn")
      .addEventListener("click", async () => {
        await this.checkConnection();
        await this.loadFiles();
      });

    container.querySelector("#settingsBtn").addEventListener("click", () => {
      this.toggleSettings();
    });

    container.querySelector("#themeToggleBtn").addEventListener("click", () => {
      this.toggleTheme();
    });

    container.querySelector("#searchInput").addEventListener("input", (e) => {
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
      this.showStatus(
        "Please configure your auth token in settings",
        "warning"
      );
      return;
    }

    // Verifica connessione prima di caricare i file
    if (!this.isConnected || !this.isAuthenticated) {
      this.showStatus(
        "Not connected or authenticated. Please check your settings.",
        "warning"
      );
      await this.checkConnection();
      if (!this.isConnected || !this.isAuthenticated) {
        return;
      }
    }

    this.isLoading = true;
    this.showStatus("Loading files...", "info");

    try {
      if (this.currentDirectoryCid) {
        // Carica contenuto della directory corrente
        this.files = await this.loadDirectoryContents(this.currentDirectoryCid);
      } else {
        // Carica file root
        this.files = await this.driveCore.getFileList();
      }

      this.fileGrid.updateFiles(this.files);
      if (this.files.length > 0) {
        this.showStatus(`Loaded ${this.files.length} item(s)`, "success");
      } else {
        this.showStatus("No files found", "info");
      }
    } catch (error) {
      const errorMessage = error.message || "Unknown error";
      this.showStatus(`Error loading files: ${errorMessage}`, "error");
      console.error("Error loading files:", error);

      // Aggiorna lo stato di connessione se c'è un errore
      await this.checkConnection();
    } finally {
      this.isLoading = false;
    }
  }

  async loadDirectoryContents(directoryCid) {
    try {
      console.log(`📂 Loading directory contents for CID: ${directoryCid}`);

      // Prova a ottenere i contenuti della directory
      const directoryData = await this.driveCore.getDirectoryContents(
        directoryCid
      );

      console.log("📂 Directory data received:", directoryData);

      // Converti i dati della directory in formato file
      const files = [];

      // Se directoryData ha una struttura con Links o altri metadati
      if (directoryData.Links && Array.isArray(directoryData.Links)) {
        console.log(
          `📂 Found ${directoryData.Links.length} items in directory`
        );

        for (const link of directoryData.Links) {
          const fileCid = link.Hash || link.hash;
          const fileName = link.Name || link.name || fileCid;

          // Determina il tipo MIME in base all'estensione del file
          const ext = fileName.split(".").pop()?.toLowerCase() || "";
          const mimeTypes = {
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            gif: "image/gif",
            webp: "image/webp",
            svg: "image/svg+xml",
            mp4: "video/mp4",
            webm: "video/webm",
            mp3: "audio/mpeg",
            wav: "audio/wav",
            pdf: "application/pdf",
            txt: "text/plain",
            json: "application/json",
            html: "text/html",
            css: "text/css",
            js: "application/javascript",
            enc: "text/plain", // File criptato
          };
          const contentType = mimeTypes[ext] || "application/octet-stream";

          files.push({
            cid: fileCid,
            name: fileName,
            originalName: fileName,
            size: link.Size || link.size || 0,
            type: contentType,
            isEncrypted: fileName.endsWith(".enc"),
            uploadedAt: Date.now(),
            relayUrl: `${this.relayUrl}/api/v1/ipfs/cat/${fileCid}`,
            isDirectory: link.Type === 1 || link.type === 1, // Type 1 = directory in IPFS
            parentDirectory: directoryCid,
            relativePath: fileName,
          });
        }
      } else {
        console.warn("📂 No Links found in directory data:", directoryData);
      }

      console.log(`📂 Processed ${files.length} files from directory`);
      return files;
    } catch (error) {
      console.error("❌ Error loading directory contents:", error);
      // Se non riesce a caricare i contenuti, mostra un errore
      throw new Error(`Failed to load directory contents: ${error.message}`);
    }
  }

  async handleUpload(files, isFolder = false) {
    if (!this.authToken) {
      this.showStatus("Please configure your auth token in settings", "error");
      this.toggleSettings();
      this.uploadArea.hide();
      return;
    }

    try {
      if (isFolder || (files.length > 0 && files[0].webkitRelativePath)) {
        // Upload come directory
        const folderName =
          files[0]?.webkitRelativePath?.split("/")[0] || "folder";
        this.showStatus(
          `Uploading folder "${folderName}" with ${files.length} file(s)...`,
          "info"
        );

        const result = await this.driveCore.uploadDirectory(files, {
          encrypt: true,
          folderName: folderName,
        });

        this.showStatus(
          `Folder "${folderName}" uploaded successfully`,
          "success"
        );

        // Ricarica i file
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await this.loadFiles();
      } else {
        // Upload file singoli
        let successCount = 0;
        let errorCount = 0;

        for (const file of files) {
          try {
            this.showStatus(`Uploading ${file.name}...`, "info");
            await this.driveCore.uploadFile(file, { encrypt: true });
            successCount++;
            this.showStatus(`${file.name} uploaded successfully`, "success");
          } catch (error) {
            errorCount++;
            this.showStatus(
              `Error uploading ${file.name}: ${error.message}`,
              "error"
            );
            console.error("Upload error:", error);
          }
        }

        // Ricarica i file solo se almeno un upload è riuscito
        if (successCount > 0) {
          try {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await this.loadFiles();
          } catch (error) {
            console.error("Error reloading files:", error);
          }
        }

        // Mostra riepilogo
        if (successCount > 0 && errorCount === 0) {
          this.showStatus(
            `Successfully uploaded ${successCount} file(s)`,
            "success"
          );
        } else if (successCount > 0 && errorCount > 0) {
          this.showStatus(
            `Uploaded ${successCount} file(s), ${errorCount} failed`,
            "warning"
          );
        } else if (errorCount > 0) {
          this.showStatus(`Failed to upload ${errorCount} file(s)`, "error");
        }
      }
    } catch (error) {
      this.showStatus(`Error uploading: ${error.message}`, "error");
      console.error("Upload error:", error);
    } finally {
      // Nascondi l'area di upload dopo il completamento
      this.uploadArea.hide();
    }
  }

  async handleFileDownload(file) {
    try {
      this.showStatus(`Downloading ${file.name}...`, "info");

      let blob;
      // Se il file è dentro una directory, usa catFromDirectory
      if (file.parentDirectory && file.relativePath) {
        blob = await this.driveCore.catFromDirectory(
          file.parentDirectory,
          file.relativePath
        );
      } else {
        blob = await this.driveCore.downloadFile(file.cid, file);
      }

      // Rimuovi l'estensione .enc se presente nel nome del file
      let downloadName = file.originalName || file.name;
      if (file.isEncrypted && downloadName.endsWith(".enc")) {
        downloadName = downloadName.slice(0, -4); // Rimuovi .enc
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Revoca l'URL dopo un breve delay per assicurarsi che il download sia iniziato
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);

      this.showStatus(`${downloadName} downloaded successfully`, "success");
    } catch (error) {
      this.showStatus(
        `Error downloading ${file.name}: ${error.message}`,
        "error"
      );
      console.error("Download error:", error);
    }
  }

  async handleFileDelete(file) {
    if (!confirm(`Are you sure you want to delete "${file.name}"?`)) {
      return;
    }

    try {
      this.showStatus(`Deleting ${file.name}...`, "info");
      await this.driveCore.deleteFile(file.cid);
      this.showStatus(`${file.name} deleted successfully`, "success");
      // Aspetta un po' prima di ricaricare per dare tempo al relay di aggiornare
      await new Promise((resolve) => setTimeout(resolve, 500));
      await this.loadFiles();
    } catch (error) {
      this.showStatus(`Error deleting ${file.name}: ${error.message}`, "error");
    }
  }

  async handleFolderClick(folder) {
    // Naviga dentro la cartella
    this.currentPath.push({
      cid: this.currentDirectoryCid,
      name: this.currentDirectoryCid ? "Folder" : "Root",
    });
    this.currentDirectoryCid = folder.cid;
    this.updateBreadcrumb();
    await this.loadFiles();
  }

  async navigateToPath(pathIndex) {
    // Naviga al percorso specificato nel breadcrumb
    if (pathIndex < 0) {
      // Root
      this.currentPath = [];
      this.currentDirectoryCid = null;
    } else {
      // Naviga fino al punto specificato
      this.currentPath = this.currentPath.slice(0, pathIndex + 1);
      const targetPath = this.currentPath[pathIndex];
      this.currentDirectoryCid = targetPath.cid;
    }
    this.updateBreadcrumb();
    await this.loadFiles();
  }

  updateBreadcrumb() {
    const breadcrumbEl = this.container?.querySelector("#breadcrumb");
    if (!breadcrumbEl) return;

    if (this.currentPath.length === 0 && !this.currentDirectoryCid) {
      breadcrumbEl.style.display = "none";
      return;
    }

    breadcrumbEl.style.display = "flex";
    breadcrumbEl.innerHTML = `
      <button class="breadcrumb-item" data-path="-1">🏠 Root</button>
      ${this.currentPath
        .map(
          (path, index) => `
        <span class="breadcrumb-separator">/</span>
        <button class="breadcrumb-item" data-path="${index}">${path.name}</button>
      `
        )
        .join("")}
      ${
        this.currentDirectoryCid
          ? `
        <span class="breadcrumb-separator">/</span>
        <span class="breadcrumb-current">${this.currentDirectoryCid.substring(
          0,
          12
        )}...</span>
      `
          : ""
      }
    `;

    // Aggiungi event listeners ai breadcrumb items
    breadcrumbEl.querySelectorAll(".breadcrumb-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pathIndex = parseInt(btn.dataset.path);
        this.navigateToPath(pathIndex);
      });
    });
  }

  handleFileClick(file) {
    // Se è una directory, apri la directory
    if (file.isDirectory || file.type === "application/x-directory") {
      this.handleFolderClick(file);
      return;
    }

    // Preview o apri file
    // Assicurati che il relayUrl includa il token se il file è criptato
    let url = file.relayUrl;
    if (file.isEncrypted && this.authToken && !url.includes("token=")) {
      const separator = url.includes("?") ? "&" : "?";
      url = `${url}${separator}token=${encodeURIComponent(this.authToken)}`;
    }

    if (
      file.type.startsWith("image/") ||
      file.type.startsWith("video/") ||
      file.type.startsWith("audio/")
    ) {
      window.open(url, "_blank", "noopener");
    } else {
      this.handleFileDownload(file);
    }
  }

  handleProgress(progress) {
    // Gestisci progresso upload/download
    if (progress.progress) {
      this.showStatus(`Progress: ${progress.progress}%`, "info");
    }
  }

  handleStatusChange(status) {
    this.currentStatus = status;
    if (status.message) {
      this.showStatus(
        status.message,
        status.status === "error" ? "error" : "info"
      );
    }
  }

  async handleSettingsSave(settings) {
    this.authToken = settings.authToken;
    this.relayUrl = settings.relayUrl;
    this.encryptionToken = settings.encryptionToken || this.encryptionToken;

    localStorage.setItem("shogun-drive-token", this.authToken);
    localStorage.setItem("shogun-drive-relay-url", this.relayUrl);
    if (this.encryptionToken) {
      localStorage.setItem(
        "shogun-drive-encryption-token",
        this.encryptionToken
      );
    } else {
      localStorage.removeItem("shogun-drive-encryption-token");
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
      this.showStatus(
        "Please check your connection and authentication",
        "warning"
      );
    }
  }

  toggleSettings() {
    const panel = this.container.querySelector("#settingsPanelContainer");
    const grid = this.container.querySelector("#fileGridContainer");

    if (panel.style.display === "none") {
      panel.style.display = "block";
      grid.style.display = "none";
    } else {
      panel.style.display = "none";
      grid.style.display = "block";
    }
  }

  handleDragOver() {
    this.uploadArea.show();
  }

  handleDragLeave() {
    // Gestisci drag leave se necessario
  }

  showStatus(message, type = "info") {
    if (!this.container) {
      // Container non ancora creato, salva il messaggio per dopo
      console.log(`[${type.toUpperCase()}] ${message}`);
      return;
    }

    const statusBar = this.container.querySelector("#statusBar");
    if (!statusBar) {
      console.log(`[${type.toUpperCase()}] ${message}`);
      return;
    }

    statusBar.textContent = message;
    statusBar.className = `status-bar status-${type}`;
    statusBar.style.display = "block";

    if (type === "success" || type === "error") {
      setTimeout(() => {
        if (statusBar) {
          statusBar.style.display = "none";
        }
      }, 3000);
    }
  }

  updateThemeIcons() {
    if (!this.container) return;

    const html = document.documentElement;
    const currentTheme = html.getAttribute("data-theme");
    const sunIcon = this.container.querySelector("#sunIcon");
    const moonIcon = this.container.querySelector("#moonIcon");

    if (currentTheme === "light") {
      sunIcon.style.display = "none";
      moonIcon.style.display = "block";
    } else {
      sunIcon.style.display = "block";
      moonIcon.style.display = "none";
    }
  }

  toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";

    html.setAttribute("data-theme", newTheme);
    localStorage.setItem("shogun-drive-theme", newTheme);

    // Update icons
    this.updateThemeIcons();

    this.showStatus(
      `Theme changed to ${newTheme === "dark" ? "Dark" : "Light"} mode`,
      "info"
    );
  }
}
