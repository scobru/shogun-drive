export class UploadArea {
  constructor(options = {}) {
    this.onUpload = options.onUpload || (() => {});
    this.onDragOver = options.onDragOver || (() => {});
    this.onDragLeave = options.onDragLeave || (() => {});
    this.isVisible = false;
  }

  render() {
    const container = document.createElement("div");
    container.className = "upload-area";
    container.style.display = "none";

    container.innerHTML = `
      <div class="upload-overlay">
        <div class="upload-box">
          <div class="upload-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h3>Drop files or folders here to upload</h3>
          <p>or click to select files or folders</p>
          <input type="file" id="fileInput" multiple style="display: none;" />
          <input type="file" id="folderInput" webkitdirectory directory multiple style="display: none;" />
        </div>
      </div>
    `;

    const uploadBox = container.querySelector(".upload-box");
    const fileInput = container.querySelector("#fileInput");
    const folderInput = container.querySelector("#folderInput");

    // Click to select files (right click or long press for folders)
    uploadBox.addEventListener("click", (e) => {
      // Default: select files
      fileInput.click();
    });

    // Right click or long press to select folders
    uploadBox.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      folderInput.click();
    });

    // File input change
    fileInput.addEventListener("change", (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        this.onUpload(files, false);
        fileInput.value = "";
      }
    });

    // Folder input change
    folderInput.addEventListener("change", (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        this.onUpload(files, true);
        folderInput.value = "";
      }
    });

    // Drag and drop
    container.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadBox.classList.add("drag-over");
      this.onDragOver();
    });

    container.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadBox.classList.remove("drag-over");
      this.onDragLeave();
    });

    container.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadBox.classList.remove("drag-over");

      const files = Array.from(e.dataTransfer.files);
      const items = Array.from(e.dataTransfer.items);

      // Check if any item is a directory
      const hasDirectory = items.some((item) => {
        try {
          return item.webkitGetAsEntry && item.webkitGetAsEntry().isDirectory;
        } catch (e) {
          return false;
        }
      });

      if (files.length > 0) {
        // If we have directory items, we need to handle them differently
        // For now, treat as folder upload if we detect directory items
        this.onUpload(files, hasDirectory);
      }
    });

    this.container = container;
    return container;
  }

  show() {
    if (this.container) {
      this.container.style.display = "block";
      this.isVisible = true;
    }
  }

  hide() {
    if (this.container) {
      this.container.style.display = "none";
      this.isVisible = false;
    }
  }
}
