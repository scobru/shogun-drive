export class SettingsPanel {
  constructor(options = {}) {
    this.authToken = options.authToken || '';
    this.relayUrl = options.relayUrl || window.location.origin;
    this.encryptionToken = options.encryptionToken || '';
    this.userAddress = options.userAddress || 'drive-user';
    this.walletConnected = options.walletConnected || false;
    this.onSave = options.onSave || (() => {});
  }

  render() {
    const container = document.createElement('div');
    container.className = 'settings-panel';
    
    // Show wallet status if connected
    const walletStatusHtml = this.walletConnected ? `
      <div class="settings-section" style="background: var(--success-bg, #10b98120); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
        <span style="color: var(--success, #10b981);">✓ Wallet connected</span>
        <p class="settings-description">Using wallet-based auth. Auth token is optional (for admin access).</p>
      </div>
    ` : '';
    
    // Hide userAddress field when wallet is connected (it's auto-set)
    const userAddressHtml = this.walletConnected ? '' : `
        <div class="settings-section">
          <label class="settings-label">
            <span>User Address (Optional)</span>
            <p class="settings-description">Your wallet address for storage quota tracking (default: drive-user)</p>
          </label>
          <input 
            type="text" 
            id="userAddressInput" 
            class="settings-input" 
            value="${this.userAddress}"
            placeholder="drive-user or your wallet address"
          />
        </div>
    `;
    
    container.innerHTML = `
      <div class="settings-content">
        <h2 class="settings-title">Settings</h2>
        
        ${walletStatusHtml}
        
        <div class="settings-section">
          <label class="settings-label">
            <span>Auth Token ${this.walletConnected ? '(Optional - for admin)' : ''}</span>
            <p class="settings-description">${this.walletConnected ? 'Optional admin token for elevated access' : 'Your admin token for authentication'}</p>
          </label>
          <input 
            type="password" 
            id="authTokenInput" 
            class="settings-input" 
            value="${this.authToken}"
            placeholder="${this.walletConnected ? 'Optional - leave empty for wallet auth' : 'Enter your auth token'}"
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

        ${userAddressHtml}

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
      const userAddressInput = container.querySelector('#userAddressInput');
      const userAddress = userAddressInput ? userAddressInput.value.trim() : this.userAddress;
      
      // Auth token required only if wallet is NOT connected
      if (!authToken && !this.walletConnected) {
        alert('Auth token is required (or connect your wallet first)');
        return;
      }

      this.onSave({
        authToken,
        relayUrl: relayUrl || window.location.origin,
        encryptionToken,
        userAddress: userAddress || 'drive-user'
      });
    });

    this.container = container;
    return container;
  }
}


