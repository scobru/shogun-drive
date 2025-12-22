# Shogun Drive - Roadmap Funzionalità

## ✅ Funzionalità Implementate

### Operazioni Base
- ✅ Upload file singoli
- ✅ Upload directory/cartelle
- ✅ Creazione cartelle vuote
- ✅ Download file
- ✅ Eliminazione file e cartelle
- ✅ Navigazione tra cartelle (breadcrumb)
- ✅ Ricerca file (per nome)
- ✅ Visualizzazione anteprima immagini/video/audio
- ✅ Criptazione file con SEA (Gun.js)
- ✅ Supporto per file criptati e non criptati

### UI/UX
- ✅ Interfaccia moderna con DaisyUI/Tailwind CSS
- ✅ Dark/Light theme
- ✅ Vista griglia file
- ✅ Indicatori di stato connessione
- ✅ Barra di stato per operazioni
- ✅ Drag & drop per upload

---

## ❌ Funzionalità Mancanti per Parità con Dropbox/Google Drive

### 1. Gestione File Avanzata

#### Spostamento/Rinomina
- ❌ **Rinomina file/cartelle** - Modificare il nome di file e cartelle
- ❌ **Spostamento file** - Trasferire file tra cartelle (cut/copy/paste)
- ❌ **Drag & drop tra cartelle** - Trascinare file da una cartella all'altra
- ❌ **Taglia/Copia/Incolla** - Operazioni clipboard per file

#### Organizzazione
- ❌ **Selezione multipla** - Selezionare più file contemporaneamente (Ctrl/Cmd + click)
- ❌ **Operazioni batch** - Download/eliminazione multipla file selezionati
- ❌ **Ordinamento file** - Per nome, data, dimensione, tipo
- ❌ **Vista lista/dettagli** - Alternativa alla vista griglia con più informazioni
- ❌ **Filtri avanzati** - Per tipo file, data, dimensione

### 2. Condivisione e Collaborazione

#### Condivisione Base
- ❌ **Link di condivisione** - Generare link pubblici/privati per file
- ❌ **Permessi di condivisione** - Solo visualizzazione, modifica, download
- ❌ **Scadenza link** - Impostare data di scadenza per link condivisi
- ❌ **Password per link** - Proteggere link condivisi con password
- ❌ **Condivisione con email** - Invio link via email

#### Collaborazione
- ❌ **Cartelle condivise** - Condividere intere cartelle con altri utenti
- ❌ **Permessi utente** - Editor, visualizzatore, proprietario
- ❌ **Commenti su file** - Sistema di commenti per collaborazione
- ❌ **Notifiche** - Avvisi quando file vengono condivisi/modificati
- ❌ **Versioni file** - Storia delle versioni e possibilità di ripristino

### 3. Anteprime e Editor

#### Anteprime
- ❌ **Anteprima PDF** - Visualizzazione inline di PDF
- ❌ **Anteprima documenti Office** - Word, Excel, PowerPoint
- ❌ **Anteprima codice** - Syntax highlighting per file di codice
- ❌ **Anteprima markdown** - Rendering markdown
- ❌ **Thumbnail automatici** - Miniature per immagini/video

#### Editor
- ❌ **Editor di testo** - Modifica file di testo direttamente nel browser
- ❌ **Editor markdown** - Editor WYSIWYG o con preview per markdown
- ❌ **Editor immagini** - Rotazione, ritaglio, filtri base

### 4. Sincronizzazione e Backup

#### Sincronizzazione
- ❌ **Client desktop** - App desktop per sincronizzazione automatica
- ❌ **Sincronizzazione bidirezionale** - Sync automatico tra dispositivi
- ❌ **Sincronizzazione selettiva** - Scegliere cartelle da sincronizzare
- ❌ **Risoluzione conflitti** - Gestione conflitti quando file vengono modificati simultaneamente

#### Backup
- ❌ **Backup automatico** - Backup periodico dei file
- ❌ **Cronologia eliminazioni** - Cestino per file eliminati (recoverable)
- ❌ **Versioning automatico** - Salvataggio automatico di versioni precedenti
- ❌ **Ripristino versioni** - Ripristinare versioni precedenti di file

### 5. Performance e Ottimizzazione

#### Gestione File Grandi
- ❌ **Upload resumable** - Riprendere upload interrotti
- ❌ **Upload in chunk** - Suddivisione file grandi in parti
- ❌ **Compressione automatica** - Compressare file prima dell'upload
- ❌ **Deduplicazione** - Rilevare file duplicati

#### Caching e Ottimizzazione
- ❌ **Cache offline** - Accesso a file recenti offline
- ❌ **Lazy loading** - Caricamento progressivo di file/cartelle grandi
- ❌ **Virtual scrolling** - Per liste molto lunghe
- ❌ **Web Workers** - Elaborazione file in background

### 6. Sicurezza e Privacy

#### Sicurezza Avanzata
- ❌ **Two-factor authentication (2FA)** - Autenticazione a due fattori
- ❌ **Activity log** - Log di tutte le operazioni (chi, cosa, quando)
- ❌ **Sessione device management** - Gestione dispositivi connessi
- ❌ **IP whitelisting** - Limitare accesso a IP specifici
- ❌ **Virus scanning** - Scansione automatica file caricati

#### Privacy
- ❌ **Zero-knowledge encryption** - Criptazione end-to-end completa
- ❌ **File locking** - Bloccare file durante modifica
- ❌ **Watermarking** - Aggiungere watermark a file condivisi
- ❌ **Access control list (ACL)** - Controllo accessi granulare

### 7. Integrazione e API

#### Integrazioni
- ❌ **API REST completa** - API per integrazioni esterne
- ❌ **Webhooks** - Notifiche eventi via webhook
- ❌ **Integrazione email** - Invio file via email
- ❌ **Integrazione cloud storage** - Import da altri servizi (Dropbox, GDrive, etc.)
- ❌ **Browser extension** - Estensioni per Chrome/Firefox

#### Import/Export
- ❌ **Esportazione dati** - Download completo di tutti i file
- ❌ **Import da altri servizi** - Migrazione da Dropbox/GDrive
- ❌ **Sync con dispositivi mobili** - App iOS/Android

### 8. Analytics e Reporting

- ❌ **Storage usage** - Visualizzazione uso spazio
- ❌ **File statistics** - Statistiche su tipi di file, dimensioni medie
- ❌ **Activity dashboard** - Dashboard con attività recenti
- ❌ **Usage reports** - Report di utilizzo nel tempo

### 9. Funzionalità Avanzate

#### Organizzazione
- ❌ **Tag/Labels** - Tag per organizzare file
- ❌ **Favoriti/Stelle** - Segnare file importanti
- ❌ **Collezioni/Album** - Raggruppare file per progetto
- ❌ **Smart folders** - Cartelle dinamiche basate su criteri

#### Automazione
- ❌ **Rules/Automazioni** - Regole automatiche (es. "Sposta PDF in cartella Documenti")
- ❌ **Scheduled tasks** - Attività programmate
- ❌ **File watchers** - Monitorare cartelle locali e sincronizzare

#### Altre Funzionalità
- ❌ **File request** - Richiedere file ad altri utenti
- ❌ **Form upload** - Form personalizzabili per raccolta file
- ❌ **OCR** - Estrazione testo da immagini
- ❌ **Full-text search** - Ricerca nel contenuto dei file (non solo nomi)

---

## 🔄 Priorità Suggerite per Implementazione

### Fase 1 - Funzionalità Base Essenziali
1. **Rinomina file/cartelle** - Fondamentale per gestione file
2. **Spostamento file** - Cut/copy/paste tra cartelle
3. **Selezione multipla** - Per operazioni batch
4. **Cestino/Recovery** - Ripristino file eliminati
5. **Ordinamento file** - Migliorare organizzazione

### Fase 2 - Condivisione Base
1. **Link di condivisione** - Condividere file con link
2. **Permessi base** - Solo visualizzazione vs modifica
3. **Anteprima PDF/Documenti** - Migliorare esperienza visualizzazione

### Fase 3 - Performance e Ottimizzazione
1. **Upload resumable** - Per file grandi
2. **Cache offline** - Accesso offline
3. **Lazy loading** - Performance migliori

### Fase 4 - Funzionalità Avanzate
1. **Versioning** - Storia versioni file
2. **Collaborazione avanzata** - Commenti, notifiche
3. **API REST** - Per integrazioni

---

## 📝 Note Tecniche

### Architettura Attuale
- **Storage**: IPFS (InterPlanetary File System)
- **Metadata**: GunDB + localStorage cache
- **Criptazione**: SEA (Gun.js)
- **UI Framework**: DaisyUI + Tailwind CSS
- **Backend**: shogun-relay

### Considerazioni per Nuove Funzionalità

#### Per Spostamento/Rinomina
- IPFS è immutable, quindi rinomina/spostamento richiede:
  - Nuovo upload con nuovo percorso/nome
  - Aggiornamento metadati
  - Eliminazione vecchio riferimento
  - O implementazione di layer di astrazione (IPNS, GunDB)

#### Per Condivisione
- Utilizzare GunDB per gestire permessi e link
- IPFS CID già fornisce link univoci, ma serve layer di permessi

#### Per Versioning
- Ogni versione è un nuovo CID in IPFS
- Necessario tracking delle versioni in metadati (GunDB)

#### Per Sincronizzazione
- Richiede client desktop con file watcher
- Sincronizzazione basata su polling o WebSocket

