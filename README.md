# Shogun Drive

Decentralized encrypted file storage application built with Vite, using IPFS as storage backend and shogun-relay as the IPFS server.

## Features

- **Decentralized Storage**: Files are stored on IPFS via shogun-relay
- **End-to-End Encryption**: Files are encrypted using SEA (Gun's encryption) before upload
- **Google Drive-like Interface**: Modern, clean UI with file grid view
- **File Management**: Upload, download, preview, and delete files
- **Search**: Search files by name or CID
- **Metadata Management**: Automatic metadata tracking for all files

## Setup

1. Install dependencies:
```bash
yarn install
```

2. Configure your relay URL and auth token in the app settings (click the settings icon)

3. Start the development server:
```bash
yarn dev
```

4. Build for production:
```bash
yarn build
```

## Usage

1. **Configure Settings**: Click the settings icon and enter your:
   - Auth Token: Your admin token for shogun-relay
   - Relay URL: The URL of your shogun-relay server (defaults to current origin)

2. **Upload Files**: 
   - Click "Upload Files" button
   - Or drag and drop files onto the upload area
   - Files are automatically encrypted before upload

3. **Manage Files**:
   - Click on a file to preview/download
   - Use the download button to download files
   - Use the delete button to remove files from IPFS

4. **Search**: Use the search box to filter files by name or CID

## Architecture

- **drive-core.js**: Core library handling IPFS operations, encryption/decryption
- **DriveApp.js**: Main application component
- **FileGrid.js**: File grid display component
- **UploadArea.js**: Drag-and-drop upload component
- **SettingsPanel.js**: Settings configuration component

## Encryption

Files are encrypted using SEA (Gun's encryption library) with your auth token before being uploaded to IPFS. The encryption ensures that only users with the correct token can decrypt and access the files.

## Requirements

- shogun-relay server running and accessible
- Valid admin token for authentication
- Modern browser with support for:
  - ES6 modules
  - Fetch API
  - File API
  - Crypto API

