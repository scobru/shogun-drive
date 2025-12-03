# Migration from Shogun-Relay to Standalone IPFS + GunDB

## Overview

Shogun Drive has been migrated from using a centralized `shogun-relay` server to a **standalone architecture** using:
- **IPFS Kubo** directly (native API)
- **GunDB** for metadata storage
- **localStorage** as metadata cache

## What Changed

### Before (shogun-relay architecture)
```
Browser → shogun-relay → IPFS Kubo
                       → GunDB
```

### After (standalone architecture)
```
Browser → IPFS Kubo (direct API calls)
       → GunDB (direct Gun.js)
       → localStorage (cache)
```

## Key Changes

### 1. IPFS API Endpoints

**Before:**
- `/api/v1/ipfs/upload` - Custom relay endpoint
- `/api/v1/ipfs/pin/ls` (GET) - List pins (Kubo-aligned)
- `/api/v1/ipfs/pin/rm` (POST) - Remove pin (Kubo-aligned)
- `/api/v1/ipfs/status` - Custom relay endpoint

**After:**
- `/api/v0/add?pin=true` - Native IPFS API
- `/api/v0/pin/ls?type=recursive` - Native IPFS API
- `/api/v0/pin/rm?arg={CID}` - Native IPFS API
- `/api/v0/version` - Native IPFS API

### 2. Authentication

**Before:**
- Bearer token authentication via relay

**After:**
- HTTP Basic Auth directly to IPFS API
- Username:Password format

### 3. Metadata Storage

**Before:**
- Stored via relay endpoints in GunDB
- `/api/v1/user-uploads/save-system-hash`
- `/api/v1/user-uploads/system-hashes-map`

**After:**
- Stored directly in localStorage (primary)
- Optionally synced to GunDB using Gun.js client-side
- No server-side API needed

### 4. File Download

**Before:**
- `/api/v1/ipfs/cat/{CID}` - Stream content (Kubo-aligned)
- `/api/v1/ipfs/cat/{CID}/decrypt?token=...` - Stream with server-side decryption

**After:**
- `/ipfs/{CID}` - Standard IPFS gateway
- Client-side decryption using SEA

## Configuration Changes

### Settings Required

1. **IPFS Username** - Basic Auth username
2. **IPFS Password** - Basic Auth password
3. **IPFS Gateway URL** - Direct IPFS Kubo API URL (port 5001)
4. **GunDB Relay URL** - GunDB server URL (port 8765)
5. **Encryption Token** - Client-side encryption key

### Example Configuration

```javascript
{
  ipfsUsername: "scobru",
  ipfsPassword: "your-password",
  ipfsUrl: "https://shogun-ipfs.scobrudot.dev",
  gundbUrl: "https://shogun-gundb.scobrudot.dev",
  encryptionToken: "auto-generated-secret"
}
```

## Benefits

1. **No Relay Dependency** - Direct communication with IPFS and GunDB
2. **Better Performance** - Fewer network hops
3. **Simpler Architecture** - No custom API layer needed
4. **More Secure** - Client-side encryption/decryption
5. **Offline Capable** - localStorage cache works offline

## Server Requirements

### IPFS Kubo

- Port **5001** (API) must be exposed
- Port **8080** (Gateway) optional for preview
- Basic Auth configured
- CORS enabled for browser access

Example IPFS config:
```json
{
  "API": {
    "HTTPHeaders": {
      "Access-Control-Allow-Origin": ["*"],
      "Access-Control-Allow-Methods": ["GET", "POST"],
      "Access-Control-Allow-Headers": ["Authorization"]
    }
  }
}
```

### GunDB

- Port **8765** exposed
- No authentication required (public read, authenticated write)
- CORS enabled

## Migration Steps for Existing Users

1. **Update Configuration**
   - Open Settings in Shogun Drive
   - Replace relay URL with separate IPFS and GunDB URLs
   - Add IPFS username and password
   - Generate new encryption token (optional, for new files)

2. **Existing Files**
   - Files already on IPFS remain accessible
   - Metadata may need to be re-cached
   - Old encrypted files use old encryption token

3. **Test Connection**
   - Click "Refresh" button
   - Check connection status indicator
   - Verify authentication works

## Troubleshooting

### "Cannot connect to IPFS"
- Verify IPFS API is exposed on port 5001
- Check CORS configuration
- Verify Basic Auth credentials

### "Authentication failed"
- Check username:password format
- Verify Basic Auth is enabled on IPFS
- Test with curl: `curl -X POST -u user:pass https://your-ipfs/api/v0/version`

### "No files found"
- Metadata is stored in localStorage
- Clear cache and re-upload files if needed
- Check browser localStorage for `shogun-drive-metadata-cache`

### CORS Errors
- IPFS API must allow browser requests
- Add CORS headers to IPFS config
- Restart IPFS daemon after config changes

## Code Changes Summary

### Modified Files

1. **`src/lib/drive-core.js`**
   - Replaced all relay endpoints with native IPFS API
   - Changed from Bearer to Basic Auth
   - Added client-side decryption
   - Implemented localStorage + GunDB metadata storage

2. **`src/components/SettingsPanel.js`**
   - Added IPFS username/password fields
   - Separated IPFS and GunDB URL configuration
   - Added encryption token generator

3. **`src/components/DriveApp.js`**
   - Updated connection check logic
   - Improved error messages
   - Better status indicators

4. **`README.md`**
   - Updated architecture documentation
   - Added IPFS API endpoints reference
   - Clarified requirements

## Testing Checklist

- [ ] Connect to IPFS API
- [ ] Authenticate with Basic Auth
- [ ] Upload encrypted file
- [ ] List pinned files
- [ ] Download and decrypt file
- [ ] Delete (unpin) file
- [ ] Metadata persistence in localStorage
- [ ] GunDB sync (optional)

## Support

For issues or questions:
- GitHub: https://github.com/scobru/shogun-drive
- Telegram: https://t.me/shogun_eco

