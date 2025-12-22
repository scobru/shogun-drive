import { DriveCore } from "../lib/drive-core.js";
import { FileGrid } from "./FileGrid.js";
import { UploadArea } from "./UploadArea.js";
import { SettingsPanel } from "./SettingsPanel.js";

// Ethers.js for wallet connection - using global from CDN (added to index.html)
const ethers = window.ethers;

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
    
    // Wallet connection state
    this.walletConnected = false;
    this.walletAddress = localStorage.getItem("shogun-drive-wallet-address") || null;
    this.provider = null;
    this.signer = null;
    
    // User address: prefer wallet address, fallback to manual setting
    this.userAddress = this.walletAddress || 
      localStorage.getItem("shogun-drive-user-address") || "";
    
    this.isConnected = false;
    this.isAuthenticated = false;
    this.currentPath = []; // Array per tracciare il percorso di navigazione (stack di directory)
    this.currentDirectoryCid = null; // CID della directory corrente (null = root)
    this.storageInfo = null; // Informazioni sullo storage

    // Set relay URL first
    this.driveCore.setRelayUrl(this.relayUrl);
    
    if (this.authToken) {
      this.driveCore.setAuthToken(this.authToken);
    }
    if (this.encryptionToken) {
      this.driveCore.setEncryptionToken(this.encryptionToken);
    }
    if (this.userAddress) {
      this.driveCore.setUserAddress(this.userAddress);
    }
    
    // Load saved wallet signature
    this.walletSignature = localStorage.getItem("shogun-drive-wallet-signature") || "";
    if (this.walletSignature) {
      this.driveCore.setWalletSignature(this.walletSignature);
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
      await this.loadStorageInfo();
    } else if (this.authToken) {
      this.showStatus(
        "Please check your connection and authentication settings",
        "warning"
      );
    }
  }

  async checkConnection() {
    // With wallet auth, we don't need authToken - just userAddress
    if (!this.userAddress && !this.authToken) {
      this.isConnected = false;
      this.isAuthenticated = false;
      this.updateConnectionStatus();
      return;
    }

    try {
      this.isConnected = await this.driveCore.checkRelayConnection();
      // With wallet auth, we're authenticated if we have a userAddress
      this.isAuthenticated = this.walletConnected || await this.driveCore.checkAuthentication();
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
    const walletBtn = this.container.querySelector("#walletBtn");
    const walletAddress = this.container.querySelector("#walletAddressDisplay");
    
    if (statusIndicator) {
      if (this.walletConnected && this.isConnected) {
        statusIndicator.className = "connection-status connected";
        statusIndicator.textContent = "● Connected";
        statusIndicator.title = `Connected as ${this.walletAddress}`;
      } else if (this.isConnected && this.isAuthenticated) {
        statusIndicator.className = "connection-status connected";
        statusIndicator.textContent = "● Connected";
        statusIndicator.title = "Connected and authenticated";
      } else if (this.isConnected) {
        statusIndicator.className = "connection-status warning";
        statusIndicator.textContent = "● No Wallet";
        statusIndicator.title = "Connected but no wallet - connect wallet to use";
      } else {
        statusIndicator.className = "connection-status disconnected";
        statusIndicator.textContent = "● Disconnected";
        statusIndicator.title = "Cannot connect to relay server";
      }
    }
    
    // Update wallet button text
    if (walletBtn) {
      if (this.walletConnected && this.walletAddress) {
        walletBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          ${this.walletAddress.slice(0, 6)}...${this.walletAddress.slice(-4)}
        `;
        walletBtn.title = `Disconnect ${this.walletAddress}`;
      } else {
        walletBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          Connect Wallet
        `;
        walletBtn.title = "Connect wallet to use Drive";
      }
    }
  }

  async connectWallet() {
    if (!window.ethereum) {
      this.showStatus("MetaMask not detected. Please install MetaMask.", "error");
      return;
    }

    try {
      this.showStatus("Connecting wallet...", "info");
      
      // Request account access - ethers v6 uses BrowserProvider
      this.provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await this.provider.send("eth_requestAccounts", []);
      
      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts returned from wallet");
      }
      
      this.walletAddress = accounts[0];
      this.signer = await this.provider.getSigner();
      this.walletConnected = true;
      
      // Update userAddress to wallet address
      this.userAddress = this.walletAddress;
      this.driveCore.setUserAddress(this.walletAddress);
      
      // Save to localStorage
      localStorage.setItem("shogun-drive-wallet-address", this.walletAddress);
      localStorage.setItem("shogun-drive-user-address", this.walletAddress);
      
      console.log(`Wallet connected: ${this.walletAddress}`);
      this.showStatus("Signing authentication message...", "info");
      
      // Sign the authentication message
      const message = "I Love Shogun";
      try {
        this.walletSignature = await this.signer.signMessage(message);
        localStorage.setItem("shogun-drive-wallet-signature", this.walletSignature);
        console.log("Wallet signature obtained");
      } catch (signError) {
        console.error("User rejected signature:", signError);
        this.showStatus("Signature rejected - wallet connected but uploads disabled", "warning");
        this.walletSignature = null;
      }
      
      // Update DriveCore with signature
      this.driveCore.setWalletSignature(this.walletSignature);
      
      this.showStatus(`Wallet connected: ${this.walletAddress.slice(0, 6)}...${this.walletAddress.slice(-4)}`, "success");
      
      // Re-render SettingsPanel with updated wallet status
      this.updateSettingsPanel();
      
      // Update UI and load files
      this.updateConnectionStatus();
      await this.checkConnection();
      
      if (this.isConnected) {
        await this.loadFiles();
        await this.loadStorageInfo();
      }
      
      // Listen for account changes
      window.ethereum.on("accountsChanged", async (accounts) => {
        if (accounts.length === 0) {
          this.disconnectWallet();
        } else if (accounts[0] !== this.walletAddress) {
          this.walletAddress = accounts[0];
          this.userAddress = accounts[0];
          this.driveCore.setUserAddress(accounts[0]);
          
          // Re-sign message with new account
          try {
            const signer = await this.provider.getSigner();
            this.walletSignature = await signer.signMessage("I Love Shogun");
            localStorage.setItem("shogun-drive-wallet-signature", this.walletSignature);
            this.driveCore.setWalletSignature(this.walletSignature);
          } catch (signErr) {
            this.walletSignature = null;
            this.driveCore.setWalletSignature(null);
          }
          
          localStorage.setItem("shogun-drive-wallet-address", accounts[0]);
          localStorage.setItem("shogun-drive-user-address", accounts[0]);
          this.updateConnectionStatus();
          this.loadFiles();
        }
      });
      
    } catch (error) {
      console.error("Wallet connection error:", error);
      this.showStatus(`Failed to connect wallet: ${error.message}`, "error");
      this.walletConnected = false;
      this.walletAddress = null;
    }
  }

  updateSettingsPanel() {
    // Re-create settings panel with current state
    const settingsPanelContainer = document.querySelector("#settingsPanelContainer");
    if (settingsPanelContainer && this.settingsPanel) {
      // Remove old panel
      settingsPanelContainer.innerHTML = "";
      
      // Create new panel with updated wallet state
      this.settingsPanel = new SettingsPanel({
        authToken: this.authToken,
        relayUrl: this.relayUrl,
        encryptionToken: this.encryptionToken,
        userAddress: this.userAddress,
        walletConnected: this.walletConnected,
        onSave: (settings) => this.handleSettingsSave(settings),
      });
      
      settingsPanelContainer.appendChild(this.settingsPanel.render());
    }
  }

  disconnectWallet() {
    this.walletConnected = false;
    this.walletAddress = null;
    this.provider = null;
    this.signer = null;
    this.userAddress = "";
    
    // Clear from localStorage
    localStorage.removeItem("shogun-drive-wallet-address");
    localStorage.removeItem("shogun-drive-user-address");
    
    // Clear driveCore user
    this.driveCore.setUserAddress("");
    
    // Clear files
    this.files = [];
    this.fileGrid?.updateFiles([]);
    
    this.showStatus("Wallet disconnected", "info");
    this.updateConnectionStatus();
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
          <button id="walletBtn" class="btn-wallet" title="Connect wallet">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            Connect Wallet
          </button>
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
          <button id="newFolderBtn" class="btn-primary">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            New Folder
          </button>
          <div id="breadcrumb" class="breadcrumb" style="display: none;"></div>
        </div>
        <div class="toolbar-right">
          <div id="storageInfo" class="storage-info" style="display: none;"></div>
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
      userAddress: this.userAddress,
      walletConnected: this.walletConnected,
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

    container.querySelector("#newFolderBtn").addEventListener("click", () => {
      this.handleNewFolder();
    });

    container
      .querySelector("#refreshBtn")
      .addEventListener("click", async () => {
        await this.checkConnection();
        await this.loadFiles();
        await this.loadStorageInfo();
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

    // Wallet button - connect or disconnect based on state
    container.querySelector("#walletBtn").addEventListener("click", async () => {
      if (this.walletConnected) {
        this.disconnectWallet();
      } else {
        await this.connectWallet();
      }
    });

    this.container = container;

    // Update theme icons based on current theme
    this.updateThemeIcons();

    // Inizializza dopo che il container è stato creato
    this.init();

    return container;
  }

  async loadFiles() {
    // Allow loading files if we have a userAddress (from wallet) or authToken (admin)
    if (!this.userAddress && !this.authToken) {
      this.showStatus(
        "Please connect your wallet or configure auth token in settings",
        "warning"
      );
      return;
    }

    // Verifica connessione prima di caricare i file
    if (!this.isConnected) {
      this.showStatus(
        "Not connected to relay. Please check your settings.",
        "warning"
      );
      await this.checkConnection();
      if (!this.isConnected) {
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

  async loadStorageInfo() {
    // Allow if we have userAddress or authToken
    if ((!this.userAddress && !this.authToken) || !this.isConnected) {
      return;
    }

    try {
      this.storageInfo = await this.driveCore.getStorageInfo();
      this.updateStorageInfoDisplay();
    } catch (error) {
      console.warn("Could not load storage info:", error);
      // Non mostrare errore all'utente, è un'informazione opzionale
    }
  }

  updateStorageInfoDisplay() {
    if (!this.container) return;

    const storageInfoEl = this.container.querySelector("#storageInfo");
    if (!storageInfoEl) return;

    if (!this.storageInfo || !this.storageInfo.success) {
      storageInfoEl.style.display = "none";
      return;
    }

    const { storage, subscription } = this.storageInfo;

    if (subscription && subscription.active) {
      // Mostra informazioni con subscription
      const usedMB = storage.usedMB || 0;
      const totalMB = subscription.totalMB || 0;
      const remainingMB = subscription.remainingMB || 0;
      const percentUsed = totalMB > 0 ? (usedMB / totalMB) * 100 : 0;

      storageInfoEl.innerHTML = `
        <div class="storage-info-content">
          <div class="storage-info-item">
            <span class="storage-label">Spazio:</span>
            <span class="storage-value">${usedMB.toFixed(2)} MB / ${totalMB.toFixed(2)} MB</span>
          </div>
          <div class="storage-info-item">
            <span class="storage-label">Rimanente:</span>
            <span class="storage-value ${remainingMB < 100 ? 'storage-warning' : ''}">${remainingMB.toFixed(2)} MB</span>
          </div>
          <div class="storage-progress">
            <div class="storage-progress-bar" style="width: ${Math.min(percentUsed, 100)}%"></div>
          </div>
        </div>
      `;
      storageInfoEl.style.display = "flex";
    } else {
      // Mostra solo spazio utilizzato (senza subscription)
      const usedMB = storage.usedMB || 0;
      const fileCount = storage.fileCount || 0;

      storageInfoEl.innerHTML = `
        <div class="storage-info-content">
          <div class="storage-info-item">
            <span class="storage-label">Spazio utilizzato:</span>
            <span class="storage-value">${usedMB.toFixed(2)} MB</span>
          </div>
          <div class="storage-info-item">
            <span class="storage-label">File:</span>
            <span class="storage-value">${fileCount}</span>
          </div>
        </div>
      `;
      storageInfoEl.style.display = "flex";
    }
  }

  async loadDirectoryContents(directoryCid) {
    try {
      console.log(`📂 Loading directory contents for CID: ${directoryCid}`);

      // Prima, prova a ottenere i metadati dalla cache locale
      // I metadati contengono la lista dei file caricati nella directory
      let metadata = null;
      try {
        // Prova dalla cache locale (questa è la fonte più affidabile perché contiene tutti i campi)
        const cachedMetadata = localStorage.getItem(
          "shogun-drive-metadata-cache"
        );
        if (cachedMetadata) {
          const parsed = JSON.parse(cachedMetadata);
          metadata = parsed.data?.[directoryCid];
          if (metadata) {
            console.log(
              `📂 Found metadata in cache for ${directoryCid}:`,
              metadata
            );

            // Gestisci il caso in cui files potrebbe essere una stringa JSON (da GunDB)
            if (metadata.files) {
              if (typeof metadata.files === "string") {
                try {
                  metadata.files = JSON.parse(metadata.files);
                  console.log(`📂 Parsed files from JSON string`);
                } catch (e) {
                  console.warn(`⚠️ Failed to parse files JSON string:`, e);
                  metadata.files = [];
                }
              }

              if (Array.isArray(metadata.files)) {
                console.log(
                  `📂 Cache has ${metadata.files.length} files in metadata`
                );
              } else {
                console.warn(
                  `⚠️ Files is not an array:`,
                  typeof metadata.files
                );
                metadata.files = [];
              }
            } else {
              console.warn(`⚠️ Cache metadata exists but no files field found`);
              console.warn(`⚠️ Metadata keys:`, Object.keys(metadata));
            }
          } else {
            console.log(`📂 No metadata in cache for ${directoryCid}`);
            console.log(
              `📂 Available CIDs in cache:`,
              Object.keys(parsed.data || {})
            );
          }
        } else {
          console.log(`📂 No cached metadata found at all`);
        }

        // Se non in cache o non ha files, prova a recuperare dal server
        // Nota: il server potrebbe non restituire il campo files, quindi usiamo la cache come priorità
        if (
          !metadata ||
          !metadata.files ||
          !Array.isArray(metadata.files) ||
          metadata.files.length === 0
        ) {
          console.log(
            `📂 Metadata not in cache or incomplete, fetching from server...`
          );
          try {
            const response = await fetch(
              `${this.relayUrl}/api/v1/user-uploads/system-hashes-map`,
              {
                method: "GET",
                headers: {
                  Authorization: this.authToken
                    ? `Bearer ${this.authToken}`
                    : undefined,
                },
              }
            );

            if (response.ok) {
              const data = await response.json();
              const systemHashes = data.systemHashes || {};
              const serverMetadata = systemHashes[directoryCid];

              if (serverMetadata) {
                console.log(`📂 Found metadata from server`);
                console.log(
                  `📂 Server metadata keys:`,
                  Object.keys(serverMetadata)
                );

                // Gestisci il caso in cui files potrebbe essere una stringa JSON (da GunDB)
                if (serverMetadata.files) {
                  if (typeof serverMetadata.files === "string") {
                    try {
                      serverMetadata.files = JSON.parse(serverMetadata.files);
                      console.log(`📂 Parsed files from JSON string`);
                    } catch (e) {
                      console.warn(`⚠️ Failed to parse files JSON string:`, e);
                      serverMetadata.files = [];
                    }
                  }

                  if (Array.isArray(serverMetadata.files)) {
                    console.log(
                      `📂 Server metadata includes ${serverMetadata.files.length} files`
                    );
                  } else {
                    console.warn(
                      `⚠️ Server files is not an array:`,
                      typeof serverMetadata.files
                    );
                    serverMetadata.files = [];
                  }
                }

                // Usa i metadati dal server (ora include anche il campo 'files')
                metadata = serverMetadata;

                // Aggiorna la cache con i metadati dal server
                try {
                  const cacheData = cachedMetadata
                    ? JSON.parse(cachedMetadata)
                    : { data: {}, timestamp: Date.now() };
                  cacheData.data[directoryCid] = metadata;
                  cacheData.timestamp = Date.now();
                  localStorage.setItem(
                    "shogun-drive-metadata-cache",
                    JSON.stringify(cacheData)
                  );
                  console.log(`📂 Updated cache with server metadata`);
                } catch (e) {
                  console.warn("⚠️ Error updating cache:", e);
                }
              }
            }
          } catch (e) {
            console.warn("⚠️ Error fetching metadata from server:", e);
          }
        }
      } catch (e) {
        console.warn("⚠️ Error reading metadata:", e);
      }

      // Se abbiamo i metadati con la lista dei file, usiamoli
      if (
        metadata &&
        metadata.files &&
        Array.isArray(metadata.files) &&
        metadata.files.length > 0
      ) {
        console.log(`📂 Using metadata to build file list`);
        const files = metadata.files.map((fileInfo) => {
          // Il path salvato nei metadati è il webkitRelativePath che include
          // il nome della directory (es. "Immagini di Bing/file.jpg")
          // Quando usiamo catFromDirectory, il directoryCid è già la directory radice,
          // quindi dobbiamo usare il path esatto come salvato in IPFS
          // IPFS con wrap-with-directory=true crea una struttura dove i file
          // sono nella root della directory, quindi il path dovrebbe essere
          // relativo alla directory radice
          let filePath = fileInfo.path || fileInfo.name;

          // Se il path inizia con il nome della directory (displayName), rimuovilo
          // perché il directoryCid è già la directory radice
          const directoryName = metadata.displayName || metadata.fileName;
          if (directoryName && filePath.startsWith(directoryName + "/")) {
            filePath = filePath.substring(directoryName.length + 1);
            console.log(
              `📂 Removed directory name from path: ${fileInfo.path} -> ${filePath}`
            );
          }

          const fullPath = `${directoryCid}/${filePath}`;

          // Determina il tipo MIME
          const ext =
            (fileInfo.name || fileInfo.path || "")
              .split(".")
              .pop()
              ?.toLowerCase() || "";
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
            enc: "text/plain",
          };
          const contentType =
            mimeTypes[ext] || fileInfo.mimetype || "application/octet-stream";

          return {
            cid: fullPath, // Usa il percorso completo per catFromDirectory
            name: fileInfo.name || fileInfo.path,
            originalName: fileInfo.name || fileInfo.path,
            size: fileInfo.size || 0,
            type: contentType,
            // Usa isEncrypted dai metadati se disponibile, altrimenti controlla l'estensione
            isEncrypted:
              fileInfo.isEncrypted !== undefined
                ? fileInfo.isEncrypted
                : (fileInfo.name || fileInfo.path || "").endsWith(".enc"),
            uploadedAt: metadata.uploadedAt || Date.now(),
            // Non costruire relayUrl per file dentro directory - useremo catFromDirectory
            relayUrl: null,
            isDirectory: false,
            parentDirectory: directoryCid,
            relativePath: filePath,
          };
        });

        console.log(`📂 Processed ${files.length} files from metadata`);
        return files;
      }

      // Se non abbiamo i metadati, non possiamo mostrare i file
      // (l'API IPFS ls non è disponibile tramite il relay)
      if (
        !metadata ||
        !metadata.files ||
        !Array.isArray(metadata.files) ||
        metadata.files.length === 0
      ) {
        console.warn(
          `⚠️ No metadata or files found for directory ${directoryCid}`
        );
        console.warn(
          `⚠️ This might happen if the directory was uploaded before metadata tracking was added`
        );
        console.warn(
          `⚠️ Try re-uploading the directory to ensure metadata is saved`
        );
        this.showStatus(
          "Directory metadata not found. Please re-upload the directory to see its contents.",
          "warning"
        );
        return [];
      }
    } catch (error) {
      console.error("❌ Error loading directory contents:", error);
      throw new Error(`Failed to load directory contents: ${error.message}`);
    }
  }

  async handleUpload(files, isFolder = false) {
    // Require either auth token (admin) or wallet connection
    if (!this.authToken && !this.walletConnected) {
      this.showStatus("Please connect your wallet or configure auth token in settings", "error");
      this.toggleSettings();
      this.uploadArea.hide();
      return;
    }

    try {
      // Verifica se siamo dentro una directory
      const isInDirectory = this.currentDirectoryCid !== null;

      if (isFolder || (files.length > 0 && files[0].webkitRelativePath)) {
        // Upload come directory
        const folderName =
          files[0]?.webkitRelativePath?.split("/")[0] || "folder";
        this.showStatus(
          `Uploading folder "${folderName}" with ${files.length} file(s)...`,
          "info"
        );

        await this.driveCore.uploadDirectory(files, {
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
      } else if (isInDirectory) {
        // Siamo dentro una directory: aggiungi i file alla directory esistente
        this.showStatus(
          `Adding ${files.length} file(s) to current folder...`,
          "info"
        );

        try {
          // Ottieni i metadati della directory corrente
          let existingFilesMetadata = [];
          try {
            const cachedMetadata = localStorage.getItem(
              "shogun-drive-metadata-cache"
            );
            if (cachedMetadata) {
              const parsed = JSON.parse(cachedMetadata);
              const dirMetadata = parsed.data?.[this.currentDirectoryCid];
              if (dirMetadata?.files && Array.isArray(dirMetadata.files)) {
                existingFilesMetadata = dirMetadata.files;
              }
            }
          } catch (e) {
            console.warn("⚠️ Could not get existing files metadata:", e);
          }

          // Aggiungi i file alla directory esistente
          const oldDirectoryCid = this.currentDirectoryCid;
          const result = await this.driveCore.addFilesToDirectory(
            this.currentDirectoryCid,
            files,
            existingFilesMetadata
          );

          // Aggiorna il currentDirectoryCid con il nuovo CID della directory aggiornata
          if (
            result.success &&
            result.directoryCid &&
            result.directoryCid !== oldDirectoryCid
          ) {
            console.log(
              `🔄 Updating current directory CID from ${oldDirectoryCid.substring(
                0,
                12
              )}... to ${result.directoryCid.substring(0, 12)}...`
            );
            this.currentDirectoryCid = result.directoryCid;
            // Aggiorna anche il breadcrumb se necessario
            if (this.currentPath.length > 0) {
              this.currentPath[this.currentPath.length - 1].cid =
                result.directoryCid;
            }
          }

          this.showStatus(
            `Successfully added ${files.length} file(s) to folder`,
            "success"
          );

          // Ricarica i file con il nuovo CID
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await this.loadFiles();
        } catch (error) {
          this.showStatus(
            `Error adding files to folder: ${error.message}`,
            "error"
          );
          console.error("Error adding files to directory:", error);
        }
      } else {
        // Upload file singoli nella root
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
            await this.loadStorageInfo();
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

  async handleNewFolder() {
    // Require either auth token (admin) or wallet connection
    if (!this.authToken && !this.walletConnected) {
      this.showStatus("Please connect your wallet or configure auth token in settings", "error");
      this.toggleSettings();
      return;
    }

    // Chiedi il nome della cartella
    const folderName = prompt("Enter folder name:");
    if (!folderName || folderName.trim() === "") {
      return; // L'utente ha annullato o non ha inserito un nome
    }

    const trimmedFolderName = folderName.trim();

    try {
      this.showStatus(`Creating folder "${trimmedFolderName}"...`, "info");
      await this.driveCore.createEmptyDirectory(trimmedFolderName);
      this.showStatus(
        `Folder "${trimmedFolderName}" created successfully`,
        "success"
      );

      // Ricarica i file
      await new Promise((resolve) => setTimeout(resolve, 500));
      await this.loadFiles();
    } catch (error) {
      this.showStatus(`Error creating folder: ${error.message}`, "error");
      console.error("Error creating folder:", error);
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
    const itemType = file.isDirectory ? "folder" : "file";
    if (
      !confirm(
        `Are you sure you want to delete this ${itemType} "${file.name}"?`
      )
    ) {
      return;
    }

    try {
      this.showStatus(`Deleting ${file.name}...`, "info");

      // Se il file è dentro una directory, usa removeFileFromDirectory
      if (file.parentDirectory && file.relativePath) {
        // Ottieni i metadati della directory corrente
        let existingFilesMetadata = [];
        try {
          const cachedMetadata = localStorage.getItem(
            "shogun-drive-metadata-cache"
          );
          if (cachedMetadata) {
            const parsed = JSON.parse(cachedMetadata);
            const dirMetadata = parsed.data?.[file.parentDirectory];
            if (dirMetadata?.files && Array.isArray(dirMetadata.files)) {
              existingFilesMetadata = dirMetadata.files;
            }
          }
        } catch (e) {
          console.warn("⚠️ Could not get existing files metadata:", e);
        }

        // Rimuovi il file dalla directory
        const oldDirectoryCid = file.parentDirectory;
        const result = await this.driveCore.removeFileFromDirectory(
          oldDirectoryCid,
          file.relativePath,
          existingFilesMetadata
        );

        // Aggiorna il currentDirectoryCid se siamo dentro quella directory
        if (
          result.success &&
          result.directoryCid &&
          result.directoryCid !== oldDirectoryCid
        ) {
          if (this.currentDirectoryCid === oldDirectoryCid) {
            this.currentDirectoryCid = result.directoryCid;
            // Aggiorna anche il breadcrumb se necessario
            if (this.currentPath.length > 0) {
              this.currentPath[this.currentPath.length - 1].cid =
                result.directoryCid;
            }
          }
        }

        this.showStatus(`${file.name} deleted successfully`, "success");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await this.loadFiles();
      } else {
        // File normale nella root: elimina normalmente
        await this.driveCore.deleteFile(file.cid, file.metadata || {});
        this.showStatus(`${file.name} deleted successfully`, "success");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await this.loadFiles();
      }
    } catch (error) {
      this.showStatus(`Error deleting ${file.name}: ${error.message}`, "error");
      console.error("Delete error:", error);
    }
  }

  async handleFolderClick(folder) {
    // Naviga dentro la cartella
    // Aggiungi solo se non siamo già nella root (evita di aggiungere "Root" al path)
    if (this.currentDirectoryCid) {
      // Ottieni il nome della directory corrente dai metadati
      let dirName = folder.name || "Folder";
      try {
        const cachedMetadata = localStorage.getItem(
          "shogun-drive-metadata-cache"
        );
        if (cachedMetadata) {
          const parsed = JSON.parse(cachedMetadata);
          const dirMetadata = parsed.data?.[this.currentDirectoryCid];
          if (dirMetadata?.displayName || dirMetadata?.fileName) {
            dirName = dirMetadata.displayName || dirMetadata.fileName;
          }
        }
      } catch (e) {
        // Usa folder.name come fallback
      }

      this.currentPath.push({
        cid: this.currentDirectoryCid,
        name: dirName,
      });
    }
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

    // Ottieni il nome della directory corrente se disponibile
    let currentDirName = null;
    if (this.currentDirectoryCid) {
      try {
        const cachedMetadata = localStorage.getItem(
          "shogun-drive-metadata-cache"
        );
        if (cachedMetadata) {
          const parsed = JSON.parse(cachedMetadata);
          const dirMetadata = parsed.data?.[this.currentDirectoryCid];
          if (dirMetadata?.displayName || dirMetadata?.fileName) {
            currentDirName = dirMetadata.displayName || dirMetadata.fileName;
          }
        }
      } catch (e) {
        // Ignora errori
      }
    }

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
        <span class="breadcrumb-current">${
          currentDirName || this.currentDirectoryCid.substring(0, 12) + "..."
        }</span>
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

  async handleFileClick(file) {
    // Se è una directory, apri la directory
    if (file.isDirectory || file.type === "application/x-directory") {
      this.handleFolderClick(file);
      return;
    }

    // Se il file è dentro una directory, usa catFromDirectory per ottenere il blob
    if (file.parentDirectory && file.relativePath) {
      try {
        console.log(`📂 Loading file from directory:`, {
          parentDirectory: file.parentDirectory,
          relativePath: file.relativePath,
          fileName: file.name,
          isEncrypted: file.isEncrypted,
        });

        this.showStatus(`Loading ${file.name}...`, "info");
        let blob = await this.driveCore.catFromDirectory(
          file.parentDirectory,
          file.relativePath
        );

        console.log(`📂 File blob retrieved:`, {
          size: blob.size,
          type: blob.type,
          isEncrypted: file.isEncrypted,
        });

        // Se il file è criptato, decriptalo
        // Controlla se il blob è già un tipo immagine/video/audio valido (già decriptato)
        const isAlreadyDecrypted =
          blob.type &&
          (blob.type.startsWith("image/") ||
            blob.type.startsWith("video/") ||
            blob.type.startsWith("audio/"));

        if (
          file.isEncrypted &&
          !isAlreadyDecrypted &&
          (this.encryptionToken || this.authToken)
        ) {
          try {
            this.showStatus(`Decrypting ${file.name}...`, "info");
            blob = await this.driveCore.decryptBlob(
              blob,
              this.encryptionToken || this.authToken
            );
            console.log(`📂 File decrypted successfully:`, {
              size: blob.size,
              type: blob.type,
            });
          } catch (decryptError) {
            console.error("Decryption error:", decryptError);
            this.showStatus(
              `Error decrypting ${file.name}: ${decryptError.message}`,
              "error"
            );
            return;
          }
        }

        // Crea un blob con il tipo corretto
        // Usa il tipo del file se disponibile, altrimenti usa il tipo del blob
        // Dopo la decrittazione, il tipo potrebbe non essere impostato, quindi usiamo file.type
        const blobType = file.type || blob.type || "application/octet-stream";
        const typedBlob =
          blob.type !== blobType ? new Blob([blob], { type: blobType }) : blob;

        // Estrai il nome del file dal path se disponibile
        const fileName =
          file.originalName ||
          file.name ||
          file.relativePath?.split("/").pop() ||
          "file";

        if (
          blobType.startsWith("image/") ||
          blobType.startsWith("video/") ||
          blobType.startsWith("audio/")
        ) {
          // Converti il blob in data URL (base64) per renderlo accessibile nella nuova finestra
          this.showStatus(`Preparing ${file.name} for display...`, "info");
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(typedBlob);
          });

          // Per immagini, video e audio, crea una pagina HTML che mostra il contenuto
          // Usa data URL invece di blob URL per renderlo accessibile nella nuova finestra
          const htmlContent = blobType.startsWith("image/")
            ? `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${fileName}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #000;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    img {
      max-width: 100%;
      max-height: 100vh;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <img src="${dataUrl}" alt="${fileName}" />
</body>
</html>`
            : blobType.startsWith("video/")
            ? `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${fileName}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #000;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    video {
      max-width: 100%;
      max-height: 100vh;
    }
  </style>
</head>
<body>
  <video src="${dataUrl}" controls autoplay></video>
</body>
</html>`
            : `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${fileName}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #000;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    audio {
      width: 100%;
      max-width: 600px;
    }
  </style>
</head>
<body>
  <audio src="${dataUrl}" controls autoplay></audio>
</body>
</html>`;

          const htmlBlob = new Blob([htmlContent], { type: "text/html" });
          const htmlUrl = URL.createObjectURL(htmlBlob);
          const newWindow = window.open(htmlUrl, "_blank", "noopener");
          if (newWindow) {
            // Revoca l'URL HTML dopo che la finestra è stata aperta
            setTimeout(() => {
              URL.revokeObjectURL(htmlUrl);
            }, 100);
          }
        } else {
          // Per altri tipi di file, scarica con il nome corretto
          const url = URL.createObjectURL(typedBlob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => {
            URL.revokeObjectURL(url);
          }, 100);
        }

        this.showStatus(`${file.name} loaded successfully`, "success");
      } catch (error) {
        this.showStatus(
          `Error loading ${file.name}: ${error.message}`,
          "error"
        );
        console.error("Error loading file from directory:", error);
      }
      return;
    }

    // Per file normali (non in directory), usa relayUrl
    if (!file.relayUrl) {
      this.showStatus(`No URL available for ${file.name}`, "error");
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
    this.userAddress = settings.userAddress || "drive-user";

    localStorage.setItem("shogun-drive-token", this.authToken);
    localStorage.setItem("shogun-drive-relay-url", this.relayUrl);
    localStorage.setItem("shogun-drive-user-address", this.userAddress);
    if (this.encryptionToken) {
      localStorage.setItem(
        "shogun-drive-encryption-token",
        this.encryptionToken
      );
    } else {
      localStorage.removeItem("shogun-drive-encryption-token");
    }

    this.driveCore.setAuthToken(this.authToken);
    this.driveCore.setRelayUrl(this.relayUrl);
    this.driveCore.setUserAddress(this.userAddress);
    if (this.encryptionToken) {
      this.driveCore.setEncryptionToken(this.encryptionToken);
    }

    this.toggleSettings();

    // Verifica connessione e autenticazione
    await this.checkConnection();

    if (this.isConnected && this.isAuthenticated) {
      await this.loadFiles();
      await this.loadStorageInfo();
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
