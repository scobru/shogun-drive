/**
 * Shogun Drive Core
 * Gestisce upload, download, criptazione e decrittazione file su IPFS
 */

export class DriveCore {
  constructor(options = {}) {
    this.relayUrl = options.relayUrl || window.location.origin;
    this.authToken = options.authToken || null;
    this.encryptionToken = options.encryptionToken || null;
    this.onProgress = options.onProgress || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
  }

  setAuthToken(token) {
    this.authToken = token;
  }

  setEncryptionToken(token) {
    this.encryptionToken = token;
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.relayUrl}/health`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      if (error.name === "AbortError") {
        console.error("Relay connection check timeout");
      } else {
        console.error("Relay connection check failed:", error);
      }
      return false;
    }
  }

  /**
   * Verifica autenticazione
   */
  async checkAuthentication() {
    if (!this.authToken) {
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      // Prova a fare una richiesta semplice per verificare l'auth
      const response = await fetch(`${this.relayUrl}/api/v1/ipfs/pin/ls`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      // Solo 200-299 sono considerati successi
      return response.ok;
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

    if (!this.authToken) {
      throw new Error("Auth token is required. Please set it in settings.");
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

    const formData = new FormData();

    // Aggiungi tutti i file al FormData mantenendo la struttura della directory
    fileEntries.forEach((fileEntry) => {
      // Convert ArrayBuffer to Uint8Array for Blob constructor (browser-compatible)
      const uint8Array = new Uint8Array(fileEntry.buffer);
      const blob = new Blob([uint8Array], {
        type: fileEntry.contentType,
      });
      formData.append("files", blob, fileEntry.path);
    });

    try {
      const response = await fetch(
        `${this.relayUrl}/api/v1/ipfs/upload-directory`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.authToken}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Directory upload failed: ${response.status}`
        );
      }

      const result = await response.json();

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
   * Upload file su IPFS via relay
   */
  async uploadFile(file, options = {}) {
    const { encrypt = true, fileName = null } = options;

    if (!this.authToken) {
      throw new Error("Auth token is required. Please set it in settings.");
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

    const formData = new FormData();
    formData.append("file", fileToUpload, uploadFileName);

    try {
      const response = await fetch(`${this.relayUrl}/api/v1/ipfs/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success || !result.file?.hash) {
        throw new Error(result.error || "Upload failed - invalid response");
      }

      const ipfsHash = result.file.hash;

      // Salva metadati nel sistema (come in upload.html)
      const now = Date.now();
      const metadata = {
        hash: ipfsHash,
        userAddress: "drive-user",
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
      // Usa l'endpoint IPFS ls per ottenere i contenuti della directory
      // Il proxy del relay passa la richiesta all'IPFS API
      const response = await fetch(
        `${this.relayUrl}/api/v1/ipfs/api/v0/ls?arg=${encodeURIComponent(
          directoryCid
        )}`,
        {
          method: "POST",
          headers: {
            Authorization: this.authToken
              ? `Bearer ${this.authToken}`
              : undefined,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "", // Empty body per POST request
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get directory contents: ${response.status}`);
      }

      const directoryData = await response.json();
      // IPFS ls restituisce { Objects: [{ Hash: "...", Links: [...] }] }
      // Estrai i Links dalla prima Object
      if (directoryData.Objects && directoryData.Objects.length > 0) {
        const links = directoryData.Objects[0].Links || [];
        return { Links: links };
      }

      return { Links: [] };
    } catch (error) {
      console.error("Error getting directory contents:", error);
      throw error;
    }
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

    // Usa l'API IPFS cat con il percorso completo
    // Format: /api/v1/ipfs/api/v0/cat?arg=QmDirectory/index.html
    const fullPath = `${directoryCid}/${filePath}`;
    const encodedPath = fullPath.includes("/")
      ? `${encodeURIComponent(directoryCid)}/${filePath
          .split("/")
          .map((p) => encodeURIComponent(p))
          .join("/")}`
      : encodeURIComponent(fullPath);

    this.onStatusChange({
      status: "downloading",
      message: `Downloading ${filePath} from directory...`,
    });

    try {
      const response = await fetch(
        `${this.relayUrl}/api/v1/ipfs/api/v0/cat?arg=${encodedPath}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.authToken}`,
            "Content-Type": "application/octet-stream",
          },
          body: "", // Empty body per evitare errori di parsing JSON
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to cat file from directory: ${response.status}`
        );
      }

      const blob = await response.blob();
      return blob;
    } catch (error) {
      console.error("Error catting file from directory:", error);
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

      const response = await fetch(
        `${this.relayUrl}/api/v1/user-uploads/save-system-hash`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.authToken}`,
          },
          body: JSON.stringify(metadata),
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log("✅ File metadata saved successfully:", result);

        // Aggiorna anche la cache locale immediatamente
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

          // Aggiungi/aggiorna i metadati nella cache
          cacheData.data[metadata.hash] = metadata;
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
   * Ottiene la lista dei file salvati
   */
  async getFileList() {
    if (!this.authToken) {
      throw new Error("Auth token is required. Please set it in settings.");
    }

    // Verifica connessione prima di procedere
    const isConnected = await this.checkRelayConnection();
    if (!isConnected) {
      throw new Error(
        "Cannot connect to relay server. Please check the relay URL in settings."
      );
    }

    try {
      // Ottieni lista pin
      const controller1 = new AbortController();
      const timeoutId1 = setTimeout(() => controller1.abort(), 10000);

      const pinsResponse = await fetch(`${this.relayUrl}/api/v1/ipfs/pin/ls`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
        signal: controller1.signal,
      });

      clearTimeout(timeoutId1);

      if (!pinsResponse.ok) {
        if (pinsResponse.status === 401) {
          throw new Error(
            "Authentication failed. Please check your auth token in settings."
          );
        }
        throw new Error(
          `Failed to get pins: ${pinsResponse.status} ${pinsResponse.statusText}`
        );
      }

      const pinsResult = await pinsResponse.json();

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
          const controller2 = new AbortController();
          const timeoutId2 = setTimeout(() => {
            controller2.abort();
          }, 15000); // 15 secondi timeout

          const metadataResponse = await fetch(
            `${this.relayUrl}/api/v1/user-uploads/system-hashes-map`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${this.authToken}`,
              },
              signal: controller2.signal,
            }
          );

          clearTimeout(timeoutId2);

          if (metadataResponse.ok) {
            const metadataData = await metadataResponse.json();
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
          } else {
            console.warn(
              "⚠️ Failed to fetch system hashes map:",
              metadataResponse.status,
              metadataResponse.statusText
            );
          }
        } catch (error) {
          // Non bloccare se i metadati non sono disponibili
          if (error.name === "AbortError") {
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

          return {
            cid,
            type: pinType,
            metadata,
            rawInfo: info,
          };
        }
      );

      // Filtra solo i pin diretti: quelli con Type === 'direct' O quelli che hanno metadati (file caricati)
      const directPins = allPins.filter((pin) => {
        // Mostra solo pin diretti o quelli con metadati (file caricati dall'utente)
        return pin.type === "direct" || Object.keys(pin.metadata).length > 0;
      });

      console.log(
        `📋 Total pins: ${allPins.length}, Direct pins: ${directPins.length}`
      );

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
   * Elimina un file (unpin)
   */
  async deleteFile(cid) {
    if (!this.authToken) {
      throw new Error("Auth token is required. Please set it in settings.");
    }

    try {
      const response = await fetch(`${this.relayUrl}/api/v1/ipfs/pin/rm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({ cid }),
      });

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.status}`);
      }

      return true;
    } catch (error) {
      throw new Error(`Delete failed: ${error.message}`);
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
