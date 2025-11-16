export class SettingsPanel {
  constructor(options = {}) {
    this.authToken = options.authToken || '';
    this.relayUrl = options.relayUrl || window.location.origin;
    this.encryptionToken = options.encryptionToken || '';
    this.onSave = options.onSave || (() => {});
  }

  render() {
    const container = document.createElement('div');
    container.className = 'settings-panel';
    
    container.innerHTML = `
      <div class="settings-content">
        <h2 class="settings-title">Settings</h2>
        
        <div class="settings-section">
          <label class="settings-label">
            <span>Auth Token</span>
            <p class="settings-description">Your admin token for authentication</p>
          </label>
          <input 
            type="password" 
            id="authTokenInput" 
            class="settings-input" 
            value="${this.authToken}"
            placeholder="Enter your auth token"
          />
        </div>

        <div class="settings-section">
          <label class="settings-label">
            <span>Relay URL</span>
            <p class="settings-description">IPFS relay server URL</p>
          </label>
          <input 
            type="text" 
            id="relayUrlInput" 
            class="settings-input" 
            value="${this.relayUrl}"
            placeholder="https://your-relay.com"
          />
        </div>

        <div class="settings-section">
          <label class="settings-label">
            <span>Encryption Token</span>
            <p class="settings-description">Secret used to encrypt/decrypt files (not your IPFS token)</p>
          </label>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input 
              type="password" 
              id="encryptionTokenInput" 
              class="settings-input" 
              value="${this.encryptionToken}"
              placeholder="Enter a strong secret or generate one"
              style="flex:1"
            />
            <button id="generateEncTokenBtn" class="btn-secondary" title="Generate random token">Generate</button>
          </div>
        </div>

        <div class="settings-actions">
          <button id="saveSettingsBtn" class="btn-primary">Save Settings</button>
          <button id="cancelSettingsBtn" class="btn-secondary">Cancel</button>
        </div>
      </div>
    `;

    // Generate random encryption token (32 bytes, base64url)
    container.querySelector('#generateEncTokenBtn').addEventListener('click', () => {
      try {
        const bytes = new Uint8Array(32);
        (window.crypto || window.msCrypto).getRandomValues(bytes);
        let base64 = btoa(String.fromCharCode(...bytes))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        container.querySelector('#encryptionTokenInput').value = base64;
      } catch (e) {
        alert('Failed to generate token: ' + e.message);
      }
    });

    container.querySelector('#saveSettingsBtn').addEventListener('click', () => {
      const authToken = container.querySelector('#authTokenInput').value.trim();
      const relayUrl = container.querySelector('#relayUrlInput').value.trim();
      const encryptionToken = container.querySelector('#encryptionTokenInput').value.trim();
      
      if (!authToken) {
        alert('Auth token is required');
        return;
      }

      this.onSave({
        authToken,
        relayUrl: relayUrl || window.location.origin,
        encryptionToken
      });
    });

    this.container = container;
    return container;
  }
}

