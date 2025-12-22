/**
 * Shogun Drive Core
 * Gestisce upload, download, criptazione e decrittazione file su IPFS
 */

import ShogunRelaySDK from "shogun-relay-sdk";

export class DriveCore {
  constructor(options = {}) {
    this.relayUrl = options.relayUrl || window.location.origin;
    this.authToken = options.authToken || null;
    this.encryptionToken = options.encryptionToken || null;
    this.userAddress = options.userAddress || "";
    this.walletSignature = options.walletSignature || "";
    this.onProgress = options.onProgress || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});

    // Initialize relay SDK with multi-user support headers
    this._initSDK();
  }

  /**
   * Initialize or reinitialize the SDK with current settings
   */
  _initSDK() {
    this.sdk = new ShogunRelaySDK({
      baseURL: this.relayUrl,
      token: this.authToken,
      userAddress: this.userAddress,
      // Send user address and signature headers for multi-user support
      extraHeaders: {
        "X-User-Address": this.userAddress || undefined,
        "X-Wallet-Signature": this.walletSignature || undefined,
      },
    });
  }

  setAuthToken(token) {
    this.authToken = token;
    if (this.sdk) {
      this.sdk.setToken(token);
    }
  }

  setRelayUrl(relayUrl) {
    this.relayUrl = relayUrl;
    this._initSDK();
  }

  setEncryptionToken(token) {
    this.encryptionToken = token;
  }

  setUserAddress(userAddress) {
    this.userAddress = userAddress || "";
    this._initSDK();
  }

  setWalletSignature(signature) {
    this.walletSignature = signature || "";
    this._initSDK();
  }

  /**
   * Converte un file in base64
   */
  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Cripta un file usando SEA
   */
  async encryptFile(file, token) {
    if (!token) {
      throw new Error("Auth token is required for encryption");
    }

    try {
      // Assicurati che SEA sia disponibile
      const SEA = await this.loadSEA();

      const base64data = await this.fileToBase64(file);
      const encryptedData = await SEA.encrypt(base64data, token);
      const encryptedFileName = file.name.endsWith(".enc")
        ? file.name
        : `${file.name}.enc`;

      return new File([encryptedData], encryptedFileName, {
        type: "text/plain",
      });
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decripta un blob usando SEA
   * Nota: Il relay server gestisce già la decrittazione quando viene passato il token,
   * ma manteniamo questo metodo per compatibilità
   */
  async decryptBlob(encryptedBlob, token) {
    if (!token) {
      throw new Error("Auth token is required for decryption");
    }

    try {
      // Assicurati che SEA sia disponibile
      const SEA = await this.loadSEA();

      const encryptedText = await encryptedBlob.text();
      const decryptedBase64 = await SEA.decrypt(encryptedText, token);

      if (!decryptedBase64) {
        throw new Error("Decryption failed - invalid token or corrupted data");
      }

      // Converti base64 data URL in blob
      if (decryptedBase64.startsWith("data:")) {
        const response = await fetch(decryptedBase64);
        return await response.blob();
      } else {
        // Se non è un data URL, prova a convertirlo
        const base64Data = decryptedBase64.split(",")[1] || decryptedBase64;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return new Blob([bytes]);
      }
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Carica la libreria SEA
   * SEA dovrebbe essere già caricato tramite script tag nell'HTML
   */
  async loadSEA() {
    if (typeof window !== "undefined" && window.SEA) {
      return window.SEA;
    }

    // Se non è disponibile, aspetta un po' e riprova (potrebbe essere ancora in caricamento)
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 10;

      const checkSEA = () => {
        if (typeof window !== "undefined" && window.SEA) {
          resolve(window.SEA);
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(checkSEA, 100);
        } else {
          reject(
            new Error(
              "SEA library not available. Make sure gun.js and sea.js are loaded in the HTML."
            )
          );
        }
      };

      checkSEA();
    });
  }

  /**
   * Verifica connessione al relay
   */
  async checkRelayConnection() {
    try {
      // Usa SDK per health check con timeout
      const healthPromise = this.sdk.system.health();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 5000)
      );

      await Promise.race([healthPromise, timeoutPromise]);
      return true;
    } catch (error) {
      if (error.message === "Timeout") {
        console.error("Relay connection check timeout");
      } else {
        console.error("Relay connection check failed:", error);
      }
      return false;
    }
  }

  /**
   * Verifica autenticazione
   * With wallet auth, having a userAddress is sufficient for user-level access
   */
  async checkAuthentication() {
    // If we have a userAddress (from wallet), user is authenticated for their own files
    if (this.userAddress) {
      return true;
    }
    
    // Admin token check for elevated access
    if (!this.authToken) {
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      // Prova a fare una richiesta semplice per verificare l'auth usando l'SDK
      try {
        await this.sdk.ipfs.pinLs();
        clearTimeout(timeoutId);
        return true;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.response && error.response.status === 401) {
          return false;
        }
        throw error;
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.error("Authentication check timeout");
      } else {
        console.error("Authentication check failed:", error);
      }
      return false;
    }
  }

  /**
   * Upload directory (folder) su IPFS via relay
   * Mantiene la struttura delle directory usando percorsi relativi
   */
  async uploadDirectory(files, options = {}) {
    const { encrypt = true, folderName = null } = options;

    // Allow upload if we have authToken (admin) or userAddress (wallet user)
    if (!this.authToken && !this.userAddress) {
      throw new Error("Please connect your wallet or set auth token in settings.");
    }

    if (!files || files.length === 0) {
      throw new Error("At least one file is required for directory upload");
    }

    // Verifica connessione al relay
    this.onStatusChange({
      status: "checking",
      message: "Checking relay connection...",
    });
    const isConnected = await this.checkRelayConnection();
    if (!isConnected) {
      throw new Error(
        "Cannot connect to relay server. Please check the relay URL in settings."
      );
    }

    // Verifica autenticazione
    this.onStatusChange({
      status: "checking",
      message: "Verifying authentication...",
    });
    const isAuthenticated = await this.checkAuthentication();
    if (!isAuthenticated) {
      throw new Error(
        "Authentication failed. Please check your auth token in settings."
      );
    }

    this.onStatusChange({
      status: "preparing",
      message: `Preparing ${files.length} file(s) for upload...`,
    });

    // Prepara i file con i loro percorsi relativi
    const fileEntries = [];

    for (const file of files) {
      // Usa file.webkitRelativePath se disponibile (da folder input)
      // Altrimenti usa solo il nome del file
      const relativePath = file.webkitRelativePath || file.name;

      // Se il file deve essere criptato, criptalo
      let fileToUpload = file;
      let isEncrypted = false;

      if (encrypt) {
        try {
          fileToUpload = await this.encryptFile(
            file,
            this.encryptionToken || this.authToken
          );
          isEncrypted = true;
          // Mantieni il percorso originale per la struttura della directory
        } catch (error) {
          console.warn(
            `Warning: Failed to encrypt ${relativePath}: ${error.message}`
          );
          // Continua senza criptare questo file
        }
      }

      // Converti il File in ArrayBuffer
      const arrayBuffer = await fileToUpload.arrayBuffer();

      fileEntries.push({
        buffer: arrayBuffer,
        filename: file.name,
        path: relativePath, // Percorso relativo per mantenere struttura directory
        contentType:
          fileToUpload.type || file.type || "application/octet-stream",
        isEncrypted: isEncrypted,
        originalName: file.name,
      });
    }

    // Upload su IPFS come directory
    this.onStatusChange({
      status: "uploading",
      message: "Uploading directory to IPFS...",
    });

    // Converti i fileEntries in File objects per l'SDK
    const fileObjects = fileEntries.map((fileEntry) => {
      const uint8Array = new Uint8Array(fileEntry.buffer);
      const blob = new Blob([uint8Array], {
        type: fileEntry.contentType || "application/octet-stream",
      });
      // Crea un File object con il path corretto
      const file = new File(
        [blob],
        fileEntry.path.split("/").pop() || fileEntry.path,
        {
          type: fileEntry.contentType || "application/octet-stream",
        }
      );
      // Imposta webkitRelativePath per mantenere la struttura directory
      Object.defineProperty(file, "webkitRelativePath", {
        value: fileEntry.path,
        writable: false,
      });
      return file;
    });

    try {
      // Usa SDK per upload directory
      const result = await this.sdk.ipfs.uploadDirectoryBrowser(fileObjects);

      if (!result.success || !result.directoryCid) {
        throw new Error(
          result.error || "Directory upload failed - invalid response"
        );
      }

      const directoryCid = result.directoryCid;
      const folderDisplayName =
        folderName ||
        (files[0].webkitRelativePath
          ? files[0].webkitRelativePath.split("/")[0]
          : "folder");

      // Salva metadati della directory nel sistema
      const now = Date.now();
      const metadata = {
        hash: directoryCid,
        userAddress: "drive-user",
        timestamp: now,
        fileName: folderDisplayName,
        displayName: folderDisplayName,
        originalName: folderDisplayName,
        fileSize: files.reduce((sum, f) => sum + f.size, 0),
        isEncrypted: fileEntries.some((f) => f.isEncrypted),
        isDirectory: true, // Marca come directory
        contentType: "application/x-directory",
        fileCount: files.length,
        files: fileEntries.map((f) => ({
          path: f.path,
          name: f.originalName,
          originalName: f.originalName,
          size: f.buffer.byteLength || 0,
          mimetype: f.contentType,
          isEncrypted: f.isEncrypted,
        })),
        relayUrl: `${this.relayUrl}/api/v1/ipfs/cat/${directoryCid}`,
        uploadedAt: now,
      };

      console.log("💾 Saving directory metadata:", metadata);
      await this.saveFileMetadata(metadata);

      this.onStatusChange({
        status: "completed",
        message: "Directory uploaded successfully",
        hash: directoryCid,
      });

      return {
        success: true,
        directoryCid: directoryCid,
        metadata,
      };
    } catch (error) {
      this.onStatusChange({
        status: "error",
        message: error.message,
      });
      throw error;
    }
  }

  /**
   * Crea una directory vuota su IPFS
   * @param folderName Il nome della directory da creare
   * @returns Promise con il CID della directory creata
   */
  async createEmptyDirectory(folderName) {
    // Allow operation if we have authToken (admin) or userAddress (wallet user)
    if (!this.authToken && !this.userAddress) {
      throw new Error("Please connect your wallet or set auth token in settings.");
    }

    // Verifica connessione al relay
    this.onStatusChange({
      status: "checking",
      message: "Checking relay connection...",
    });
    const isConnected = await this.checkRelayConnection();
    if (!isConnected) {
      throw new Error(
        "Cannot connect to relay server. Please check the relay URL in settings."
      );
    }

    // Verifica autenticazione
    this.onStatusChange({
      status: "checking",
      message: "Verifying authentication...",
    });
    const isAuthenticated = await this.checkAuthentication();
    if (!isAuthenticated) {
      throw new Error(
        "Authentication failed. Please check your auth token in settings."
      );
    }

    this.onStatusChange({
      status: "preparing",
      message: `Creating empty folder "${folderName}"...`,
    });

    // Crea un file placeholder vuoto con il nome della directory
    // IPFS richiede almeno un file per creare una directory
    const placeholderBlob = new Blob([], { type: "application/x-empty" });
    const placeholderFile = new File([placeholderBlob], ".keep", {
      type: "application/x-empty",
    });
    // Imposta webkitRelativePath per mantenere la struttura directory
    Object.defineProperty(placeholderFile, "webkitRelativePath", {
      value: `${folderName}/.keep`,
      writable: false,
    });

    try {
      // Usa SDK per creare directory vuota
      const result = await this.sdk.ipfs.uploadDirectoryBrowser([
        placeholderFile,
      ]);

      if (!result.success || !result.directoryCid) {
        throw new Error(
          result.error || "Directory creation failed - invalid response"
        );
      }

      const directoryCid = result.directoryCid;

      // Salva metadati della directory vuota nel sistema
      const now = Date.now();
      const metadata = {
        hash: directoryCid,
        userAddress: "drive-user",
        timestamp: now,
        fileName: folderName,
        displayName: folderName,
        originalName: folderName,
        fileSize: 0,
        isEncrypted: false,
        isDirectory: true,
        contentType: "application/x-directory",
        fileCount: 0, // Directory vuota
        files: [], // Nessun file
        relayUrl: `${this.relayUrl}/api/v1/ipfs/cat/${directoryCid}`,
        uploadedAt: now,
      };

      console.log("💾 Saving empty directory metadata:", metadata);
      await this.saveFileMetadata(metadata);

      this.onStatusChange({
        status: "completed",
        message: "Empty directory created successfully",
        hash: directoryCid,
      });

      return {
        success: true,
        directoryCid: directoryCid,
        metadata,
      };
    } catch (error) {
      this.onStatusChange({
        status: "error",
        message: error.message,
      });
      throw error;
    }
  }

  /**
   * Upload file su IPFS via relay
   */
  async uploadFile(file, options = {}) {
    const { encrypt = true, fileName = null } = options;

    // Allow upload if we have authToken (admin) or userAddress (wallet user)
    if (!this.authToken && !this.userAddress) {
      throw new Error("Please connect your wallet or set auth token in settings.");
    }

    // Verifica connessione al relay
    this.onStatusChange({
      status: "checking",
      message: "Checking relay connection...",
    });
    const isConnected = await this.checkRelayConnection();
    if (!isConnected) {
      throw new Error(
        "Cannot connect to relay server. Please check the relay URL in settings."
      );
    }

    // Verifica autenticazione
    this.onStatusChange({
      status: "checking",
      message: "Verifying authentication...",
    });
    const isAuthenticated = await this.checkAuthentication();
    if (!isAuthenticated) {
      throw new Error(
        "Authentication failed. Please check your auth token in settings."
      );
    }

    this.onStatusChange({
      status: "encrypting",
      message: "Encrypting file...",
    });

    let fileToUpload = file;
    let isEncrypted = false;
    let uploadFileName = fileName || file.name;

    // Cripta il file se richiesto
    if (encrypt) {
      try {
        fileToUpload = await this.encryptFile(
          file,
          this.encryptionToken || this.authToken
        );
        isEncrypted = true;
        uploadFileName = fileToUpload.name;
        this.onStatusChange({
          status: "encrypting",
          message: "File encrypted, uploading...",
        });
      } catch (error) {
        throw new Error(`Encryption failed: ${error.message}`);
      }
    }

    // Upload su IPFS
    this.onStatusChange({
      status: "uploading",
      message: "Uploading to IPFS...",
    });

    // Converti Blob in File se necessario per l'SDK
    let fileToUploadFile = fileToUpload;
    if (fileToUpload instanceof Blob && !(fileToUpload instanceof File)) {
      fileToUploadFile = new File([fileToUpload], uploadFileName, {
        type: fileToUpload.type || "application/octet-stream",
      });
    } else if (
      fileToUpload instanceof File &&
      fileToUpload.name !== uploadFileName
    ) {
      // Se il nome del file è diverso, crea un nuovo File con il nome corretto
      fileToUploadFile = new File([fileToUpload], uploadFileName, {
        type: fileToUpload.type || "application/octet-stream",
      });
    }

    try {
      let ipfsHash;
      
      // Use direct fetch for wallet mode (SDK doesn't support extraHeaders)
      if (this.walletSignature && this.userAddress) {
        console.log("📤 Using wallet auth for upload");
        
        const formData = new FormData();
        formData.append("file", fileToUploadFile);
        
        const headers = {
          "X-User-Address": this.userAddress,
          "X-Wallet-Signature": this.walletSignature,
        };
        
        // Add auth token if available (admin mode)
        if (this.authToken) {
          headers["Authorization"] = `Bearer ${this.authToken}`;
        }
        
        const response = await fetch(`${this.relayUrl}/api/v1/ipfs/upload`, {
          method: "POST",
          headers,
          body: formData,
        });
        
        const result = await response.json();
        
        if (!response.ok) {
          // Handle specific error cases
          if (response.status === 401) {
            throw new Error(result.hint || result.error || "Authentication failed - check wallet signature");
          }
          if (response.status === 402) {
            throw new Error("Subscription required - please purchase a subscription to upload files");
          }
          throw new Error(result.error || `Upload failed with status ${response.status}`);
        }
        
        if (!result.success || !result.file?.hash) {
          throw new Error(result.error || "Upload failed - invalid response");
        }
        
        ipfsHash = result.file.hash;
      } else {
        // Use SDK for admin mode (with auth token)
        console.log("📤 Using SDK for upload (admin mode)");
        const result = await this.sdk.ipfs.uploadFileBrowser(fileToUploadFile);

        if (!result.success || !result.file?.hash) {
          throw new Error(result.error || "Upload failed - invalid response");
        }
        
        ipfsHash = result.file.hash;
      }

      // Salva metadati nel sistema (come in upload.html)
      const now = Date.now();
      const metadata = {
        hash: ipfsHash,
        userAddress: this.userAddress || "drive-user",
        timestamp: now,
        fileName: uploadFileName,
        displayName: uploadFileName, // Usa uploadFileName come displayName (come in upload.html)
        originalName: file.name,
        fileSize: fileToUpload.size ?? file.size, // Usa la dimensione del file caricato (criptato o meno)
        isEncrypted: isEncrypted,
        contentType:
          fileToUpload.type || file.type || "application/octet-stream",
        relayUrl: `${this.relayUrl}/api/v1/ipfs/cat/${ipfsHash}${
          isEncrypted
            ? `/decrypt?token=${encodeURIComponent(
                this.encryptionToken || this.authToken
              )}`
            : ""
        }`,
        uploadedAt: now,
      };

      console.log("💾 Saving file metadata:", metadata);
      await this.saveFileMetadata(metadata);

      this.onStatusChange({
        status: "completed",
        message: "File uploaded successfully",
        hash: ipfsHash,
      });

      return {
        success: true,
        hash: ipfsHash,
        metadata,
      };
    } catch (error) {
      this.onStatusChange({
        status: "error",
        message: error.message,
      });
      throw error;
    }
  }

  /**
   * Ottiene il contenuto di una directory IPFS
   * @param directoryCid Il CID della directory
   * @returns Promise con la struttura della directory
   */
  async getDirectoryContents(directoryCid) {
    try {
      console.log(`🔍 Fetching directory contents for CID: ${directoryCid}`);

      // Usa l'endpoint IPFS ls per ottenere i contenuti della directory
      // Il proxy del relay passa la richiesta all'IPFS API
      const url = `${
        this.relayUrl
      }/api/v1/ipfs/api/v0/ls?arg=${encodeURIComponent(directoryCid)}`;
      console.log(`🔍 Request URL: ${url}`);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: this.authToken
            ? `Bearer ${this.authToken}`
            : undefined,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "", // Empty body per POST request
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error(`❌ API Error (${response.status}):`, errorText);
        throw new Error(
          `Failed to get directory contents: ${response.status} - ${errorText}`
        );
      }

      const directoryData = await response.json();
      console.log("🔍 Raw directory data from API:", directoryData);

      // IPFS ls restituisce { Objects: [{ Hash: "...", Links: [...] }] }
      // Estrai i Links dalla prima Object
      if (directoryData.Objects && directoryData.Objects.length > 0) {
        const firstObject = directoryData.Objects[0];
        console.log("🔍 First object:", firstObject);
        const links = firstObject.Links || [];
        console.log(`🔍 Found ${links.length} links in directory`);
        return { Links: links };
      }

      // Se non ci sono Objects, potrebbe essere una struttura diversa
      // Prova a cercare Links direttamente nella risposta
      if (directoryData.Links && Array.isArray(directoryData.Links)) {
        console.log(
          `🔍 Found ${directoryData.Links.length} links directly in response`
        );
        return { Links: directoryData.Links };
      }

      console.warn(
        "⚠️ No Links found in directory data structure:",
        directoryData
      );
      return { Links: [] };
    } catch (error) {
      console.error("❌ Error getting directory contents:", error);
      throw error;
    }
  }

  /**
   * Aggiunge file a una directory esistente
   * @param directoryCid Il CID della directory esistente
   * @param newFiles Array di File objects da aggiungere
   * @param existingFilesMetadata Array di metadati dei file esistenti nella directory
   * @returns Promise con il nuovo CID della directory aggiornata
   */
  async addFilesToDirectory(
    directoryCid,
    newFiles,
    existingFilesMetadata = []
  ) {
    // Allow operation if we have authToken (admin) or userAddress (wallet user)
    if (!this.authToken && !this.userAddress) {
      throw new Error("Please connect your wallet or set auth token in settings.");
    }

    this.onStatusChange({
      status: "preparing",
      message: `Preparing to add files to directory...`,
    });

    // Raccogli tutti i file (esistenti + nuovi)
    const allFiles = [];

    // Aggiungi i file esistenti (li dobbiamo scaricare e riconvertire in File)
    for (const fileMeta of existingFilesMetadata) {
      try {
        // Normalizza il path: rimuovi il nome della directory se presente
        let filePath = fileMeta.path || fileMeta.name;
        const pathParts = filePath.split("/");
        // Se il path contiene "/", prendi solo l'ultima parte (nome del file)
        if (pathParts.length > 1) {
          filePath = pathParts[pathParts.length - 1];
        }

        const blob = await this.catFromDirectory(directoryCid, filePath);

        // Verifica che il blob non sia vuoto
        if (!blob || blob.size === 0) {
          console.warn(`⚠️ Empty blob for file ${filePath}, skipping`);
          continue;
        }

        // Determina il path relativo da usare (priorità: path > name > originalName)
        const relativePath =
          fileMeta.path || fileMeta.name || fileMeta.originalName;

        // Crea un File object usando il relativePath come nome (così l'SDK lo userà come path)
        // Se webkitRelativePath non funziona, file.name sarà comunque corretto
        const existingFile = new File([blob], relativePath, {
          type: fileMeta.mimetype || "application/octet-stream",
        });

        // IMPORTANTE: Imposta webkitRelativePath per mantenere la struttura directory
        // L'SDK usa webkitRelativePath || file.name per determinare il path
        try {
          Object.defineProperty(existingFile, "webkitRelativePath", {
            value: relativePath,
            writable: false,
            configurable: false,
            enumerable: false,
          });
        } catch (defineError) {
          console.warn(
            `⚠️ Could not set webkitRelativePath, using file.name (${relativePath}):`,
            defineError
          );
          // Non è un problema critico - l'SDK userà file.name se webkitRelativePath non è disponibile
        }

        allFiles.push(existingFile);
      } catch (error) {
        console.warn(
          `⚠️ Failed to retrieve existing file ${fileMeta.path}:`,
          error
        );
        // Continua con gli altri file anche se uno fallisce
      }
    }

    // Aggiungi i nuovi file e assicurati che abbiano webkitRelativePath se necessario
    for (const newFile of newFiles) {
      // Se il nuovo file non ha webkitRelativePath, impostalo usando il nome del file
      if (!newFile.webkitRelativePath) {
        Object.defineProperty(newFile, "webkitRelativePath", {
          value: newFile.name,
          writable: false,
        });
      }
      allFiles.push(newFile);
    }

    if (allFiles.length === 0) {
      throw new Error("No files to upload");
    }

    // Ottieni il nome della directory dai metadati esistenti o usa un nome di default
    // Per ora usiamo un approccio semplice: recuperiamo i metadati della directory
    let folderName = "folder";
    try {
      const cachedMetadata = localStorage.getItem(
        "shogun-drive-metadata-cache"
      );
      if (cachedMetadata) {
        const parsed = JSON.parse(cachedMetadata);
        const dirMetadata = parsed.data?.[directoryCid];
        if (dirMetadata?.displayName || dirMetadata?.fileName) {
          folderName = dirMetadata.displayName || dirMetadata.fileName;
        }
      }
    } catch (e) {
      console.warn("⚠️ Could not get directory name from metadata:", e);
    }

    // Usa uploadDirectory per ricreare la directory con tutti i file
    // Nota: uploadDirectory gestirà la criptazione se necessario
    const result = await this.uploadDirectory(allFiles, {
      encrypt: true,
      folderName: folderName,
    });

    // Dopo aver creato la nuova directory, elimina la vecchia directory
    if (
      result.success &&
      result.directoryCid &&
      result.directoryCid !== directoryCid
    ) {
      try {
        console.log(
          `🗑️ Removing old directory ${directoryCid.substring(
            0,
            12
          )}... and replacing with new one ${result.directoryCid.substring(
            0,
            12
          )}...`
        );

        // Elimina il pin della vecchia directory
        try {
          await this.sdk.ipfs.pinRm(directoryCid);
          console.log(`✅ Old directory pin removed`);
        } catch (pinError) {
          console.warn(`⚠️ Failed to remove old directory pin:`, pinError);
          // Continua comunque con la rimozione dei metadati
        }

        // Rimuovi i metadati della vecchia directory usando SDK
        try {
          await this.sdk.uploads.removeSystemHash(directoryCid, "drive-user");
          console.log(`✅ Old directory metadata removed from server`);
        } catch (metadataError) {
          console.warn(
            `⚠️ Error removing old directory metadata:`,
            metadataError
          );
        }

        // Rimuovi dalla cache locale
        try {
          const cachedMetadata = localStorage.getItem(
            "shogun-drive-metadata-cache"
          );
          if (cachedMetadata) {
            const parsed = JSON.parse(cachedMetadata);
            if (parsed.data && parsed.data[directoryCid]) {
              delete parsed.data[directoryCid];
              parsed.timestamp = Date.now();
              localStorage.setItem(
                "shogun-drive-metadata-cache",
                JSON.stringify(parsed)
              );
              console.log(`✅ Old directory removed from local cache`);
            }
          }
        } catch (cacheError) {
          console.warn(
            `⚠️ Error removing old directory from cache:`,
            cacheError
          );
        }
      } catch (cleanupError) {
        console.warn(
          `⚠️ Error cleaning up old directory (non-critical):`,
          cleanupError
        );
        // Non bloccare l'operazione se la pulizia fallisce
      }
    }

    return result;
  }

  /**
   * Rimuove un file da una directory esistente
   * @param directoryCid Il CID della directory esistente
   * @param filePathToRemove Il path relativo del file da rimuovere
   * @param existingFilesMetadata Array di metadati dei file esistenti nella directory
   * @returns Promise con il nuovo CID della directory aggiornata
   */
  async removeFileFromDirectory(
    directoryCid,
    filePathToRemove,
    existingFilesMetadata = []
  ) {
    if (!this.authToken) {
      throw new Error("Auth token is required. Please set it in settings.");
    }

    this.onStatusChange({
      status: "preparing",
      message: `Preparing to remove file from directory...`,
    });

    // Filtra i file esistenti per rimuovere quello specificato
    const remainingFilesMetadata = existingFilesMetadata.filter((fileMeta) => {
      const filePath = fileMeta.path || fileMeta.name;
      // Normalizza il path per confronto
      const normalizedPath = filePath.split("/").pop();
      const normalizedPathToRemove = filePathToRemove.split("/").pop();
      return normalizedPath !== normalizedPathToRemove;
    });

    if (remainingFilesMetadata.length === existingFilesMetadata.length) {
      throw new Error("File not found in directory");
    }

    // Raccogli i file rimanenti (scarica e riconverti in File)
    const allFiles = [];

    for (const fileMeta of remainingFilesMetadata) {
      try {
        // Normalizza il path: rimuovi il nome della directory se presente
        let filePath = fileMeta.path || fileMeta.name;
        const pathParts = filePath.split("/");
        // Se il path contiene "/", prendi solo l'ultima parte (nome del file)
        if (pathParts.length > 1) {
          filePath = pathParts[pathParts.length - 1];
        }

        const blob = await this.catFromDirectory(directoryCid, filePath);

        // Verifica che il blob non sia vuoto
        if (!blob || blob.size === 0) {
          console.warn(`⚠️ Empty blob for file ${filePath}, skipping`);
          continue;
        }

        // Determina il path relativo da usare (priorità: path > name > originalName)
        const relativePath =
          fileMeta.path || fileMeta.name || fileMeta.originalName;

        // Crea un File object usando il relativePath come nome (così l'SDK lo userà come path)
        // Se webkitRelativePath non funziona, file.name sarà comunque corretto
        const existingFile = new File([blob], relativePath, {
          type: fileMeta.mimetype || "application/octet-stream",
        });

        // IMPORTANTE: Imposta webkitRelativePath per mantenere la struttura directory
        // L'SDK usa webkitRelativePath || file.name per determinare il path
        try {
          Object.defineProperty(existingFile, "webkitRelativePath", {
            value: relativePath,
            writable: false,
            configurable: false,
            enumerable: false,
          });
        } catch (defineError) {
          console.warn(
            `⚠️ Could not set webkitRelativePath, using file.name (${relativePath}):`,
            defineError
          );
          // Non è un problema critico - l'SDK userà file.name se webkitRelativePath non è disponibile
        }

        allFiles.push(existingFile);
      } catch (error) {
        console.warn(
          `⚠️ Failed to retrieve existing file ${fileMeta.path}:`,
          error
        );
        // Continua con gli altri file anche se uno fallisce
      }
    }

    if (allFiles.length === 0 && remainingFilesMetadata.length > 0) {
      throw new Error("Failed to retrieve remaining files from directory");
    }

    // Ottieni il nome della directory dai metadati esistenti
    let folderName = "folder";
    try {
      const cachedMetadata = localStorage.getItem(
        "shogun-drive-metadata-cache"
      );
      if (cachedMetadata) {
        const parsed = JSON.parse(cachedMetadata);
        const dirMetadata = parsed.data?.[directoryCid];
        if (dirMetadata?.displayName || dirMetadata?.fileName) {
          folderName = dirMetadata.displayName || dirMetadata.fileName;
        }
      }
    } catch (e) {
      console.warn("⚠️ Could not get directory name from metadata:", e);
    }

    // Se non ci sono più file, potremmo voler eliminare la directory
    // Ma per ora ricreiamo la directory anche se vuota (con file .keep)
    if (allFiles.length === 0) {
      // Crea una directory vuota
      return await this.createEmptyDirectory(folderName);
    }

    // Usa uploadDirectory per ricreare la directory con i file rimanenti
    const result = await this.uploadDirectory(allFiles, {
      encrypt: true,
      folderName: folderName,
    });

    // Dopo aver creato la nuova directory, elimina la vecchia directory
    if (
      result.success &&
      result.directoryCid &&
      result.directoryCid !== directoryCid
    ) {
      try {
        console.log(
          `🗑️ Removing old directory ${directoryCid.substring(
            0,
            12
          )}... and replacing with new one ${result.directoryCid.substring(
            0,
            12
          )}...`
        );

        // Elimina il pin della vecchia directory
        try {
          await this.sdk.ipfs.pinRm(directoryCid);
          console.log(`✅ Old directory pin removed`);
        } catch (pinError) {
          console.warn(`⚠️ Failed to remove old directory pin:`, pinError);
        }

        // Rimuovi i metadati della vecchia directory usando SDK
        try {
          await this.sdk.uploads.removeSystemHash(directoryCid, "drive-user");
          console.log(`✅ Old directory metadata removed from server`);
        } catch (metadataError) {
          console.warn(
            `⚠️ Error removing old directory metadata:`,
            metadataError
          );
        }

        // Rimuovi dalla cache locale
        try {
          const cachedMetadata = localStorage.getItem(
            "shogun-drive-metadata-cache"
          );
          if (cachedMetadata) {
            const parsed = JSON.parse(cachedMetadata);
            if (parsed.data && parsed.data[directoryCid]) {
              delete parsed.data[directoryCid];
              parsed.timestamp = Date.now();
              localStorage.setItem(
                "shogun-drive-metadata-cache",
                JSON.stringify(parsed)
              );
              console.log(`✅ Old directory removed from local cache`);
            }
          }
        } catch (cacheError) {
          console.warn(
            `⚠️ Error removing old directory from cache:`,
            cacheError
          );
        }
      } catch (cleanupError) {
        console.warn(
          `⚠️ Error cleaning up old directory (non-critical):`,
          cleanupError
        );
      }
    }

    return result;
  }

  /**
   * Cat a file from an IPFS directory using a relative path
   * @param directoryCid The CID of the directory
   * @param filePath The relative path to the file within the directory (e.g., "index.html" or "css/style.css")
   * @returns Promise with file content as Blob
   */
  async catFromDirectory(directoryCid, filePath) {
    if (!this.authToken) {
      throw new Error("Auth token is required. Please set it in settings.");
    }

    this.onStatusChange({
      status: "downloading",
      message: `Downloading ${filePath} from directory...`,
    });

    try {
      // Normalizza il filePath: rimuovi eventuali prefissi di directory
      // Il filePath dovrebbe essere relativo alla directory radice
      let normalizedPath = filePath;

      // Se il path contiene "/", potrebbe includere il nome della directory
      // Rimuoviamo tutto prima dell'ultimo "/" se presente
      const pathParts = normalizedPath.split("/");
      if (pathParts.length > 1) {
        // Prendi solo l'ultima parte (il nome del file)
        normalizedPath = pathParts[pathParts.length - 1];
      }

      console.log(`🔍 Cat from directory: ${directoryCid}/${normalizedPath}`);
      console.log(`🔍 File path details:`, {
        directoryCid,
        originalPath: filePath,
        normalizedPath: normalizedPath,
        fullPath: `${directoryCid}/${normalizedPath}`,
      });

      // Usa l'SDK del relay invece di chiamate fetch dirette
      // L'SDK restituisce un Buffer, ma nel browser dobbiamo convertirlo in Blob
      const buffer = await this.sdk.ipfs.catFromDirectory(
        directoryCid,
        normalizedPath
      );

      // Converti Buffer in Blob per il browser
      // Buffer è un Uint8Array nel browser quando usato con axios
      const blob =
        buffer instanceof ArrayBuffer
          ? new Blob([buffer])
          : new Blob([new Uint8Array(buffer)]);

      console.log(
        `✅ Successfully retrieved file from directory: ${normalizedPath} (${blob.size} bytes)`
      );
      return blob;
    } catch (error) {
      console.error("Error catting file from directory:", error);

      // Gestisci errori dall'SDK
      if (error.response) {
        const errorData = error.response.data || error.response.statusText;
        throw new Error(
          `Failed to cat file from directory: ${
            error.response.status
          } - ${JSON.stringify(errorData)}`
        );
      }
      throw error;
    }
  }

  /**
   * Download file da IPFS
   * Il relay server gestisce automaticamente la decrittazione quando viene passato il token nella query string
   * IMPORTANTE: Il token deve essere nella query string, non nell'Authorization header per la decrittazione
   */
  async downloadFile(hash, metadata = {}) {
    if (metadata.isEncrypted && !(this.encryptionToken || this.authToken)) {
      throw new Error("Encryption token is required to decrypt this file.");
    }

    // Il relay server decripta automaticamente se il token è presente nella query string
    // Usa /api/v1/ipfs/cat/:cid/decrypt per la decrittazione
    let url = metadata.isEncrypted
      ? `${
          this.relayUrl
        }/api/v1/ipfs/cat/${hash}/decrypt?token=${encodeURIComponent(
          this.encryptionToken || this.authToken
        )}`
      : `${this.relayUrl}/api/v1/ipfs/cat/${hash}`;

    this.onStatusChange({
      status: "downloading",
      message: "Downloading from IPFS...",
    });

    try {
      console.log("📥 Downloading from:", url);

      // Per file grandi, usa XMLHttpRequest invece di fetch per evitare problemi HTTP/2
      const fileSize = metadata.size || 0;
      const isLargeFile = fileSize > 5 * 1024 * 1024; // > 5MB

      if (isLargeFile) {
        console.log("📦 Large file detected, using XMLHttpRequest...");
        return await this.downloadWithXHR(url, metadata);
      }

      // Per file grandi, usa un approccio più robusto con retry
      const maxRetries = 3;
      let response = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            controller.abort();
          }, 300000); // 5 minuti timeout per file grandi

          try {
            response = await fetch(url, {
              headers: {
                Authorization: this.authToken
                  ? `Bearer ${this.authToken}`
                  : undefined,
                Accept: "*/*",
              },
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            // Se la risposta è ok, esci dal loop
            if (response.ok) {
              break;
            }

            // Se non è ok, lancia un errore
            const errorText = await response.text().catch(() => "");
            throw new Error(`Download failed: ${response.status} ${errorText}`);
          } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === "AbortError") {
              throw new Error(
                "Download timeout - file too large or connection too slow"
              );
            }

            // Se è un errore HTTP/2 e non è l'ultimo tentativo, riprova
            if (
              attempt < maxRetries - 1 &&
              (error.message.includes("HTTP2") ||
                error.message.includes("Failed to fetch") ||
                error.message.includes("ERR_HTTP2"))
            ) {
              console.warn(
                `⚠️ Download attempt ${attempt + 1} failed, retrying...`,
                error.message
              );
              // Aspetta un po' prima di riprovare
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * (attempt + 1))
              );
              continue;
            }

            throw error;
          }
        } catch (error) {
          if (attempt === maxRetries - 1) {
            throw error;
          }
          // Aspetta prima di riprovare
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * (attempt + 1))
          );
        }
      }

      if (!response || !response.ok) {
        const errorText = response
          ? await response.text().catch(() => "")
          : "No response";
        throw new Error(
          `Download failed: ${response?.status || "unknown"} ${errorText}`
        );
      }

      // Verifica il Content-Type per capire se il file è stato decriptato
      const contentType = response.headers.get("Content-Type") || "";
      const contentLength = response.headers.get("Content-Length");
      console.log("📥 Response Content-Type:", contentType);
      if (contentLength) {
        console.log("📥 Response Content-Length:", contentLength, "bytes");
      }

      let blob;

      // Se il file è criptato, verifica se il server ha decriptato
      if (metadata.isEncrypted) {
        // Se il Content-Type è diverso da text/plain o application/json,
        // il server ha già decriptato e restituito i dati binari
        if (
          contentType &&
          !contentType.includes("text/plain") &&
          !contentType.includes("application/json")
        ) {
          // Il server ha già decriptato, usa direttamente il blob
          console.log("✅ Server already decrypted, using blob directly");

          // Per evitare problemi HTTP/2, usa direttamente il reader invece di blob()
          // Il reader è più robusto per file di qualsiasi dimensione
          console.log("📦 Using stream reader to avoid HTTP/2 issues...");
          const reader = response.body.getReader();
          const chunks = [];
          let totalLength = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunks.push(value);
            totalLength += value.length;

            // Aggiorna il progresso se disponibile
            if (contentLength) {
              const progress = Math.round(
                (totalLength / parseInt(contentLength)) * 100
              );
              this.onProgress({
                progress,
                loaded: totalLength,
                total: parseInt(contentLength),
              });
            }
          }

          // Combina tutti i chunks in un unico blob
          const allChunks = new Uint8Array(totalLength);
          let position = 0;
          for (const chunk of chunks) {
            allChunks.set(chunk, position);
            position += chunk.length;
          }

          blob = new Blob([allChunks], { type: contentType });
        } else {
          // Potrebbe essere ancora criptato, leggi come testo per verificare
          const text = await response.text();

          // Se inizia con "SEA{" significa che è ancora criptato (il server non ha decriptato)
          if (text.trim().startsWith("SEA{")) {
            console.log(
              "🔓 File is still encrypted, decrypting client-side..."
            );
            this.onStatusChange({
              status: "decrypting",
              message: "Decrypting file...",
            });

            // Decripta lato client
            const SEA = await this.loadSEA();
            const decrypted = await SEA.decrypt(
              text,
              this.encryptionToken || this.authToken
            );

            if (!decrypted) {
              throw new Error(
                "Decryption failed - invalid token or corrupted data"
              );
            }

            // Se è un data URL, convertilo in blob
            if (decrypted.startsWith("data:")) {
              const dataResponse = await fetch(decrypted);
              blob = await dataResponse.blob();
            } else {
              // Se non è un data URL, crea un blob dal testo decriptato
              blob = new Blob([decrypted], {
                type: contentType || "application/octet-stream",
              });
            }
          } else {
            // Il server ha già decriptato ma restituito come testo, converti in blob
            blob = new Blob([text], {
              type: contentType || "application/octet-stream",
            });
          }
        }
      } else {
        // File non criptato, usa direttamente il reader per evitare problemi HTTP/2
        console.log("📦 Using stream reader to avoid HTTP/2 issues...");
        const reader = response.body.getReader();
        const chunks = [];
        let totalLength = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          totalLength += value.length;

          // Aggiorna il progresso se disponibile
          if (contentLength) {
            const progress = Math.round(
              (totalLength / parseInt(contentLength)) * 100
            );
            this.onProgress({
              progress,
              loaded: totalLength,
              total: parseInt(contentLength),
            });
          }
        }

        const allChunks = new Uint8Array(totalLength);
        let position = 0;
        for (const chunk of chunks) {
          allChunks.set(chunk, position);
          position += chunk.length;
        }

        blob = new Blob([allChunks], {
          type: contentType || "application/octet-stream",
        });
      }

      // Verifica che il blob non sia vuoto o corrotto
      if (blob.size === 0) {
        throw new Error("Downloaded file is empty");
      }

      console.log("📥 Downloaded blob size:", blob.size, "bytes");

      this.onStatusChange({
        status: "completed",
        message: "File downloaded successfully",
      });

      return blob;
    } catch (error) {
      console.error("❌ Download error:", error);
      this.onStatusChange({
        status: "error",
        message: error.message,
      });
      throw error;
    }
  }

  /**
   * Download file usando XMLHttpRequest (più robusto per file grandi e HTTP/2)
   */
  async downloadWithXHR(url, metadata = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.responseType = "blob";

      // Aggiungi header Authorization se disponibile
      if (this.authToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${this.authToken}`);
      }
      xhr.setRequestHeader("Accept", "*/*");

      // Gestisci il progresso
      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          this.onProgress({
            progress,
            loaded: event.loaded,
            total: event.total,
          });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const blob = xhr.response;

          if (blob.size === 0) {
            reject(new Error("Downloaded file is empty"));
            return;
          }

          console.log("📥 Downloaded blob size:", blob.size, "bytes");

          this.onStatusChange({
            status: "completed",
            message: "File downloaded successfully",
          });

          resolve(blob);
        } else {
          reject(new Error(`Download failed: ${xhr.status} ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error("Network error during download"));
      };

      xhr.ontimeout = () => {
        reject(new Error("Download timeout"));
      };

      // Timeout di 5 minuti per file grandi
      xhr.timeout = 300000;

      xhr.send();
    });
  }

  /**
   * Salva metadati file nel sistema
   */
  async saveFileMetadata(metadata) {
    try {
      console.log("💾 Sending metadata to save-system-hash:", metadata);

      // Usa SDK per salvare metadati
      const result = await this.sdk.uploads.saveSystemHash(metadata);

      if (result.success) {
        console.log("✅ File metadata saved successfully:", result);

        // Aggiorna anche la cache locale immediatamente
        // IMPORTANTE: Salva i metadati COMPLETI (incluso il campo files) nella cache locale
        // perché il server potrebbe non restituire tutti i campi quando vengono recuperati
        try {
          const cachedMetadata = localStorage.getItem(
            "shogun-drive-metadata-cache"
          );
          let cacheData = { data: {}, timestamp: Date.now() };

          if (cachedMetadata) {
            try {
              const parsed = JSON.parse(cachedMetadata);
              cacheData.data = parsed.data || {};
            } catch (e) {
              // Ignora errori di parsing
            }
          }

          // Aggiungi/aggiorna i metadati COMPLETI nella cache
          // Questo preserva il campo 'files' che è essenziale per le directory
          console.log(
            "💾 Caching complete metadata with files:",
            metadata.files ? `${metadata.files.length} files` : "no files"
          );
          cacheData.data[metadata.hash] = { ...metadata }; // Copia completa dei metadati
          cacheData.timestamp = Date.now();

          localStorage.setItem(
            "shogun-drive-metadata-cache",
            JSON.stringify(cacheData)
          );
          console.log("💾 Metadata cached locally");
        } catch (error) {
          console.warn("⚠️ Error updating metadata cache:", error);
        }
      } else {
        const errorText = await response.text();
        console.warn(
          "⚠️ Failed to save file metadata:",
          response.status,
          errorText
        );
      }
    } catch (error) {
      console.error("❌ Error saving file metadata:", error);
      // Non bloccare l'upload se il salvataggio dei metadati fallisce
    }
  }

  /**
   * Get user uploads from relay server (for wallet mode)
   * Uses the same endpoint as shogun-deals to fetch user-specific uploads
   */
  async getUserUploads(userAddress) {
    if (!userAddress) {
      throw new Error("User address is required");
    }

    try {
      console.log(`📋 Fetching user uploads for ${userAddress.slice(0, 8)}...`);
      
      // Use SDK for consistency
      const data = await this.sdk.uploads.getUserUploads(userAddress);
      
      if (!data.success) {
        throw new Error(data.error || "Failed to fetch user uploads");
      }

      const uploads = data.uploads || [];
      console.log(`📋 Found ${uploads.length} uploads for user`);

      // Map uploads to DriveCore format
      const files = uploads.map((upload) => {
        // Detect if file is encrypted based on mimetype and name
        const isEncrypted = 
          upload.mimetype === "text/plain" && 
          (upload.name?.endsWith(".enc") || upload.name?.endsWith(".encrypted"));

        // Build relay URL with decrypt endpoint if encrypted
        const relayUrl = isEncrypted && (this.encryptionToken || this.authToken)
          ? `${this.relayUrl}/api/v1/ipfs/cat/${upload.hash}/decrypt?token=${encodeURIComponent(
              this.encryptionToken || this.authToken
            )}`
          : `${this.relayUrl}/api/v1/ipfs/cat/${upload.hash}`;

        return {
          cid: upload.hash,
          name: upload.name || upload.hash,
          originalName: upload.name || upload.hash,
          size: upload.size || 0,
          type: upload.mimetype || "application/octet-stream",
          isEncrypted: isEncrypted,
          isDirectory: false,
          fileCount: 0,
          uploadedAt: upload.uploadedAt || Date.now(),
          relayUrl: relayUrl,
          metadata: {
            ...upload,
            userAddress: userAddress,
            displayName: upload.name,
            fileName: upload.name,
            fileSize: upload.size,
            contentType: upload.mimetype,
          },
        };
      });

      return files;
    } catch (error) {
      console.error("Error getting user uploads:", error);
      throw error;
    }
  }

  /**
   * Ottiene la lista dei file salvati
   */
  async getFileList() {
    // Allow operation if we have authToken (admin) or userAddress (wallet user)
    if (!this.authToken && !this.userAddress) {
      throw new Error("Please connect your wallet or set auth token in settings.");
    }

    // Verifica connessione prima di procedere
    const isConnected = await this.checkRelayConnection();
    if (!isConnected) {
      throw new Error(
        "Cannot connect to relay server. Please check the relay URL in settings."
      );
    }

    // In wallet mode (no admin token), use user-specific uploads endpoint
    // This matches the behavior of shogun-deals and ensures files are properly visible
    if (!this.authToken && this.userAddress) {
      console.log("📁 Wallet mode: fetching user-specific uploads");
      try {
        return await this.getUserUploads(this.userAddress);
      } catch (error) {
        console.error("Error fetching user uploads:", error);
        throw new Error(`Failed to fetch your uploads: ${error.message}`);
      }
    }

    // Admin mode: use existing pin listing logic
    console.log("🔐 Admin mode: fetching all pins");

    try {
      // Ottieni lista pin (solo per admin mode)
      let pinsResult = { success: true, pins: [] };
      
      // Skip pin/ls for wallet mode (use system-hashes-map instead)
      if (this.authToken) {
        const controller1 = new AbortController();
        const timeoutId1 = setTimeout(() => controller1.abort(), 10000);

        // Usa l'SDK per admin mode
        try {
          pinsResult = await this.sdk.ipfs.pinLs();
          clearTimeout(timeoutId1);
        } catch (error) {
          clearTimeout(timeoutId1);
          if (error.response && error.response.status === 401) {
            throw new Error(
              "Authentication failed. Please check your auth token in settings."
            );
          }
          console.warn("⚠️ Could not get pins, using metadata only:", error.message);
          // Don't throw, just use empty pins and rely on metadata
        }
      } else {
        console.log("📁 Wallet mode: using metadata-only file loading");
      }

      // Ottieni metadati sistema (opzionale, non blocca se fallisce)
      // Prova prima dalla cache locale, poi dal server
      let systemHashMap = {};

      // Carica cache locale se disponibile
      try {
        const cachedMetadata = localStorage.getItem(
          "shogun-drive-metadata-cache"
        );
        if (cachedMetadata) {
          const parsed = JSON.parse(cachedMetadata);
          // Usa la cache solo se non è troppo vecchia (max 5 minuti)
          if (
            parsed.timestamp &&
            Date.now() - parsed.timestamp < 5 * 60 * 1000
          ) {
            systemHashMap = parsed.data || {};
            console.log(
              "📦 Using cached metadata:",
              Object.keys(systemHashMap).length,
              "entries"
            );
          }
        }
      } catch (error) {
        console.warn("⚠️ Error loading metadata cache:", error);
      }

      // Prova a recuperare i metadati dal server in background (non blocca)
      // Usa un timeout più breve e non aspetta se fallisce
      const fetchMetadataPromise = (async () => {
        try {
          // Usa SDK per recuperare system hashes map con timeout
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 15000)
          );

          const metadataData = await Promise.race([
            this.sdk.uploads.getSystemHashesMap(),
            timeoutPromise,
          ]);

          const newSystemHashMap = metadataData.systemHashes || {};
          console.log(
            "🗂️ System Hash Map retrieved from server:",
            Object.keys(newSystemHashMap).length,
            "entries"
          );

          // Aggiorna la cache locale
          try {
            localStorage.setItem(
              "shogun-drive-metadata-cache",
              JSON.stringify({
                data: newSystemHashMap,
                timestamp: Date.now(),
              })
            );
          } catch (error) {
            console.warn("⚠️ Error saving metadata cache:", error);
          }

          // Aggiorna la mappa corrente (merge con i dati esistenti)
          systemHashMap = { ...systemHashMap, ...newSystemHashMap };

          if (Object.keys(newSystemHashMap).length > 0) {
            console.log(
              "🗂️ System Hash Map keys (first 10):",
              Object.keys(newSystemHashMap).slice(0, 10)
            );
          }
        } catch (error) {
          // Non bloccare se i metadati non sono disponibili
          if (error.message === "Timeout") {
            console.log(
              "⏰ System hashes map request timed out, using cached data if available"
            );
          } else {
            console.warn("⚠️ Could not fetch system hashes map:", error);
          }
        }
      })();

      // Non aspettiamo il completamento, procediamo con i dati disponibili
      // Il fetch continuerà in background e aggiornerà la cache

      // Combina dati (come in pin-manager.html)
      // Filtra solo i pin diretti (quelli caricati direttamente, non gli hash indiretti)
      const allPins = Object.entries(pinsResult.pins || {}).map(
        ([cid, info]) => {
          const metadata = systemHashMap[cid] || {};
          const pinType = info.Type || "recursive";

          // Log per debug delle directory
          if (
            metadata.isDirectory ||
            metadata.contentType === "application/x-directory"
          ) {
            console.log(
              `📁 Directory found in pins: ${cid.substring(0, 12)}...`,
              {
                isDirectory: metadata.isDirectory,
                contentType: metadata.contentType,
                hasFiles: !!metadata.files,
                fileCount: metadata.fileCount,
              }
            );
          }

          return {
            cid,
            type: pinType,
            metadata,
            rawInfo: info,
          };
        }
      );

      // Log per debug: verifica directory nei metadati
      const directoriesInMetadata = Object.entries(systemHashMap).filter(
        ([cid, meta]) =>
          meta.isDirectory === true ||
          meta.contentType === "application/x-directory"
      );
      if (directoriesInMetadata.length > 0) {
        console.log(
          `📁 Found ${directoriesInMetadata.length} directories in system hash map:`,
          directoriesInMetadata.map(([cid]) => cid.substring(0, 12) + "...")
        );
      }

      // Filtra solo i pin diretti: quelli con Type === 'direct' O quelli che hanno metadati (file caricati)
      // IMPORTANTE: Le directory potrebbero non essere nei pins, ma devono essere mostrate se hanno metadati
      const directPins = allPins.filter((pin) => {
        // Mostra solo pin diretti o quelli con metadati (file caricati dall'utente)
        const hasMetadata = Object.keys(pin.metadata).length > 0;
        const isDir =
          pin.metadata.isDirectory === true ||
          pin.metadata.contentType === "application/x-directory";

        if (hasMetadata && isDir) {
          console.log(
            `📁 Found directory in pins: ${pin.cid.substring(0, 12)}...`
          );
        }

        return pin.type === "direct" || hasMetadata;
      });

      console.log(
        `📋 Total pins: ${allPins.length}, Direct pins: ${directPins.length}`
      );

      // Verifica se ci sono directory nei metadati che non sono nei pins
      const directoryCids = Object.keys(systemHashMap).filter((cid) => {
        const meta = systemHashMap[cid];
        return (
          meta.isDirectory === true ||
          meta.contentType === "application/x-directory"
        );
      });

      if (directoryCids.length > 0) {
        console.log(
          `📁 Found ${directoryCids.length} directories in system hash map:`,
          directoryCids.map((c) => c.substring(0, 12) + "...")
        );

        // Aggiungi le directory che non sono nei pins
        directoryCids.forEach((dirCid) => {
          const existsInPins = directPins.some((pin) => pin.cid === dirCid);
          if (!existsInPins) {
            console.log(
              `📁 Adding directory ${dirCid.substring(
                0,
                12
              )}... that's not in pins`
            );
            // Aggiungi la directory ai directPins anche se non è nei pins
            directPins.push({
              cid: dirCid,
              type: "recursive", // Le directory sono generalmente recursive
              metadata: systemHashMap[dirCid],
              rawInfo: {},
            });
          }
        });
      }

      const files = directPins.map(({ cid, metadata, rawInfo: info }) => {
        // Log per debug
        if (Object.keys(metadata).length > 0) {
          console.log(
            `🔍 Processing file ${cid.substring(0, 12)}... with metadata:`,
            metadata
          );
        } else {
          console.log(
            `⚠️ File ${cid.substring(
              0,
              12
            )}... has no metadata in systemHashMap`
          );
        }

        // Try multiple fields to get the display name (come in pin-manager.html)
        const displayName =
          metadata.displayName ||
          metadata.fileName ||
          metadata.originalName ||
          metadata.name ||
          info.Name ||
          info.Metadata?.name ||
          cid;

        // Assicurati che uploadedAt sia valido (non futuro)
        let uploadedAt =
          metadata.uploadedAt || metadata.timestamp || Date.now();
        const uploadDate = new Date(uploadedAt);
        if (uploadDate.getTime() > Date.now() || isNaN(uploadDate.getTime())) {
          console.warn(
            `⚠️ Invalid date for ${cid}: ${uploadedAt}, using current date`
          );
          uploadedAt = Date.now();
        }

        // Costruisci relayUrl con token se il file è criptato
        let relayUrl = metadata.relayUrl;
        if (!relayUrl) {
          relayUrl =
            metadata.isEncrypted && (this.encryptionToken || this.authToken)
              ? `${
                  this.relayUrl
                }/api/v1/ipfs/cat/${cid}/decrypt?token=${encodeURIComponent(
                  this.encryptionToken || this.authToken
                )}`
              : `${this.relayUrl}/api/v1/ipfs/cat/${cid}`;
        }

        // Per i file criptati, il contentType salvato è "text/plain" (file criptato)
        // Ma dobbiamo usare il contentType originale per determinare il tipo
        // Se abbiamo originalName, possiamo dedurre il tipo dall'estensione
        let contentType = metadata.contentType || "application/octet-stream";
        if (
          metadata.isEncrypted &&
          contentType === "text/plain" &&
          metadata.originalName
        ) {
          // Prova a dedurre il tipo dall'estensione del file originale
          const ext = metadata.originalName.split(".").pop().toLowerCase();
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
          };
          if (mimeTypes[ext]) {
            contentType = mimeTypes[ext];
          }
        }

        return {
          cid,
          name: displayName,
          originalName:
            metadata.originalName || metadata.fileName || displayName,
          size: metadata.fileSize || 0,
          type: contentType,
          isEncrypted: metadata.isEncrypted || false,
          isDirectory: metadata.isDirectory || false,
          fileCount: metadata.fileCount || 0,
          uploadedAt: uploadedAt,
          relayUrl: relayUrl,
          metadata,
        };
      });

      console.log(`📋 Processed ${files.length} files`);

      // In wallet mode (no authToken), filter files by userAddress - only show user's own files
      if (!this.authToken && this.userAddress) {
        const userFiles = files.filter(file => {
          const fileUserAddress = file.metadata?.userAddress || "";
          // Only show files belonging to THIS user (strict match)
          return fileUserAddress.toLowerCase() === this.userAddress.toLowerCase();
        });
        console.log(`📁 Wallet mode: showing ${userFiles.length} files for user ${this.userAddress.slice(0, 8)}...`);
        return userFiles;
      }

      return files;
    } catch (error) {
      console.error("Error getting file list:", error);

      // Migliora i messaggi di errore
      if (error.name === "AbortError" || error.name === "TimeoutError") {
        throw new Error(
          "Request timeout. The relay server may be slow or unreachable."
        );
      } else if (
        error.message.includes("Failed to fetch") ||
        error.message.includes("NetworkError") ||
        error.message.includes("Network request failed")
      ) {
        throw new Error(
          "Network error. Please check your connection and relay URL."
        );
      } else if (error.message.includes("CORS")) {
        throw new Error(
          "CORS error. Please check if the relay server allows requests from this origin."
        );
      }

      throw error;
    }
  }

  /**
   * Elimina un file o directory (unpin + rimuove metadati)
   */
  async deleteFile(cid, metadata = {}) {
    // Auth token or wallet signature required
    if (!this.authToken && !this.walletSignature) {
      throw new Error("Auth token or wallet connection is required.");
    }

    try {
      // 1. Rimuovi il pin IPFS (solo per admin mode)
      if (this.authToken) {
        console.log(`🗑️ Admin mode: Removing IPFS pin for ${cid.substring(0, 12)}...`);
        try {
          await this.sdk.ipfs.pinRm(cid);
          console.log(`✅ IPFS pin removed successfully`);
        } catch (error) {
          const errorText =
            error.response?.data || error.message || "Unknown error";
          console.warn(`⚠️ Pin removal failed: ${error.response?.status || "unknown"} - ${JSON.stringify(errorText)}`);
          // Don't throw in admin mode either, continue to remove metadata
        }
      } else {
        console.log(`📁 Wallet mode: Removing file from user's view (metadata only)`);
      }

      // 2. Rimuovi i metadati dal system hash map usando SDK o fetch
      try {
        console.log(`🗑️ Removing metadata from system hash map...`);
        if (this.authToken) {
          await this.sdk.uploads.removeSystemHash(
            cid,
            metadata.userAddress || this.userAddress || "drive-user"
          );
        } else if (this.walletSignature && this.userAddress) {
          // Use direct fetch for wallet mode
          const response = await fetch(`${this.relayUrl}/api/v1/uploads/remove-system-hash`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-User-Address": this.userAddress,
              "X-Wallet-Signature": this.walletSignature,
            },
            body: JSON.stringify({
              hash: cid,
              userAddress: this.userAddress,
            }),
          });
          if (!response.ok) {
            console.warn(`⚠️ Metadata removal returned ${response.status}`);
          }
        }
        console.log(`✅ Metadata removed from system hash map`);
      } catch (metadataError) {
        console.warn(`⚠️ Error removing metadata:`, metadataError);
        // Non bloccare se la rimozione dei metadati fallisce
      }

      // 3. Rimuovi i metadati dalla cache locale
      try {
        const cachedMetadata = localStorage.getItem(
          "shogun-drive-metadata-cache"
        );
        if (cachedMetadata) {
          const parsed = JSON.parse(cachedMetadata);
          if (parsed.data && parsed.data[cid]) {
            delete parsed.data[cid];
            parsed.timestamp = Date.now();
            localStorage.setItem(
              "shogun-drive-metadata-cache",
              JSON.stringify(parsed)
            );
            console.log(`✅ Metadata removed from local cache`);
          }
        }
      } catch (cacheError) {
        console.warn(`⚠️ Error removing from cache:`, cacheError);
        // Non bloccare se la rimozione dalla cache fallisce
      }

      return true;
    } catch (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  /**
   * Ottiene informazioni sullo storage utilizzato e rimanente
   * @returns Promise con informazioni sullo storage
   */
  async getStorageInfo() {
    // Auth token or wallet signature required
    if (!this.authToken && !this.walletSignature) {
      throw new Error("Auth token or wallet connection is required. Please set it in settings or connect wallet.");
    }

    try {
      // Usa SDK per ottenere informazioni sullo storage
      const result = await this.sdk.x402.getStorageUsage(this.userAddress);

      if (!result.success) {
        throw new Error(result.error || "Failed to get storage information");
      }

      return {
        success: true,
        userAddress: result.userAddress,
        storage: {
          usedBytes: result.storage?.usedBytes || 0,
          usedMB: result.storage?.usedMB || 0,
          fileCount: result.storage?.fileCount || 0,
          verified: result.storage?.verified || false,
        },
        subscription: result.subscription
          ? {
              tier: result.subscription.tier,
              totalMB: result.subscription.totalMB || 0,
              remainingMB: result.subscription.remainingMB || 0,
              recordedUsedMB: result.subscription.recordedUsedMB || 0,
              discrepancy: result.subscription.discrepancy || 0,
              expiresAt: result.subscription.expiresAt,
              active: true,
            }
          : null,
      };
    } catch (error) {
      console.error("Error getting storage info:", error);
      throw new Error(`Failed to get storage information: ${error.message}`);
    }
  }

  /**
   * Formatta bytes in formato leggibile
   */
  formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  /**
   * Ottiene l'icona del file in base al tipo
   */
  getFileIcon(contentType, isDirectory = false) {
    if (isDirectory || contentType === "application/x-directory") return "📁";
    if (contentType.startsWith("image/")) return "🖼️";
    if (contentType.startsWith("video/")) return "🎥";
    if (contentType.startsWith("audio/")) return "🎵";
    if (contentType.includes("pdf")) return "📄";
    if (contentType.includes("text") || contentType.includes("json"))
      return "📝";
    if (contentType.includes("zip") || contentType.includes("archive"))
      return "📦";
    return "📄";
  }
}
