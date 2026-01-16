# CoT Publisher

Progressive Web App (PWA) per pubblicare messaggi di posizione CoT (Cursor on Target) via **UDP** verso un server specificato.

## Funzionalità

- 📍 **Tracciamento posizione GPS** - Utilizza la geolocalizzazione del dispositivo
- 📡 **Invio UDP** - Messaggi CoT inviati tramite protocollo UDP
- ⚙️ **Configurazione completa** - IP destinazione, porta UDP, campi CoT personalizzabili, intervallo di invio
- ▶️ **Controlli semplici** - Pulsanti Avvia e Pausa
- 📱 **PWA** - Installabile e funzionante offline
- 📊 **Monitoraggio in tempo reale** - Stato, posizione, contatore messaggi e log

## Architettura

Poiché i browser web non possono inviare pacchetti UDP direttamente, l'applicazione utilizza un'architettura proxy:

```
[PWA Browser] --HTTP--> [Proxy Server] --UDP--> [CoT Server]
```

Il proxy server (implementato in Rust con `cot-proxy`) riceve messaggi CoT via HTTP e li inoltra come pacchetti UDP al server CoT di destinazione.

## Installazione e Avvio

### 1. Avviare il Proxy Server

Il proxy server è necessario per inoltrare i messaggi via UDP:

#### Versione Rust (Consigliata)

```bash
# Installare Rust se non già presente (https://rustup.rs/)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Compilare il proxy server
cargo build --release

# Avviare il proxy server Rust
./target/release/cot-proxy

# Oppure usando npm
npm run build
npm start
```

#### Versione Node.js (Alternativa)

```bash
# Installare Node.js se non già presente (https://nodejs.org/)

# Avviare il proxy server Node.js
node proxy-server.js

# Oppure usando npm
npm run start:node
```

Il proxy server si avvierà sulla porta 8080 (default) e mostrerà:
```
==============================================
  CoT UDP Proxy Server (Rust)
==============================================
  HTTP Server listening on port 8080
  Endpoint: http://localhost:8080/cot
...
```

### 2. Avviare l'Applicazione PWA

Apri `index.html` direttamente nel browser o servila tramite un web server:

```bash
# Usando Python
python3 -m http.server 8000

# Usando Node.js (con http-server)
npx http-server -p 8000

# Usando PHP
php -S localhost:8000
```

Poi apri `http://localhost:8000` nel browser.

## Utilizzo

1. **Configura la connessione:**
   - **Indirizzo Proxy**: Indirizzo del proxy server HTTP (default: `localhost:8080`)
   - **Indirizzo UDP Destinazione**: IP del server CoT (es: `192.168.1.100`)
   - **Porta UDP**: Porta del server CoT (es: `8087`)

2. **Personalizza i campi CoT:**
   - **Callsign**: Identificativo dell'unità
   - **Team**: Colore del team (Cyan, Blue, Green, ecc.)
   - **Role**: Ruolo dell'unità (Team Member, Team Lead, ecc.)
   - **UID**: Identificativo unico (auto-generato se vuoto)

3. **Imposta l'intervallo di invio** in secondi

4. **Clicca su "Avvia"** per iniziare la pubblicazione

5. **Clicca su "Pausa"** per interrompere

### Configurazione Porta Proxy

Per cambiare la porta del proxy server:

```bash
# Versione Rust
PORT=3000 ./target/release/cot-proxy

# Versione Node.js
PORT=3000 node proxy-server.js
```

## Formato CoT

L'applicazione genera messaggi CoT standard XML (versione 2.0) con:
- Tipo evento: `a-f-G-U-C` (Friendly Ground Unit)
- Punto con coordinate lat/lon/hae
- Dettagli: callsign, team, role, status, track
- Inviati come pacchetti UDP al server destinazione

## Test con netcat

Per testare la ricezione dei pacchetti UDP:

```bash
# Ricevi pacchetti UDP sulla porta 8087
nc -ul 8087

# Oppure usando socat
socat UDP4-RECV:8087 STDOUT
```

## HTTPS per Geolocalizzazione

La geolocalizzazione richiede HTTPS (tranne per localhost). Per testare su dispositivi mobili:

1. Usa un servizio come [ngrok](https://ngrok.com/):
   ```bash
   ngrok http 8000
   ```

2. Oppure genera un certificato self-signed per HTTPS locale

## Compatibilità

- ✅ Chrome/Edge (consigliato)
- ✅ Firefox
- ✅ Safari (iOS 13+)
- ✅ Dispositivi mobili Android/iOS
- ✅ Rust 1.70+ (per il proxy server Rust, consigliato)
- ✅ Node.js (per il proxy server Node.js, alternativa)

## Note Tecniche

- L'applicazione richiede il permesso di accesso alla posizione
- Il proxy server deve essere in esecuzione per inoltrare i messaggi UDP
- Il proxy supporta CORS per permettere richieste cross-origin
- I messaggi vengono inviati come pacchetti UDP singoli
- Il Service Worker abilita il funzionamento offline dell'interfaccia PWA

## Sicurezza

### Configurazione Proxy Server

Per limitare le destinazioni UDP in produzione, usa la variabile d'ambiente `ALLOWED_UDP_HOSTS`:

```bash
# Versione Rust
ALLOWED_UDP_HOSTS="192.168.1.100,192.168.1.101,10.0.0.0/8" ./target/release/cot-proxy

# Versione Node.js
ALLOWED_UDP_HOSTS="192.168.1.100,192.168.1.101,10.0.0.0/8" node proxy-server.js

# O specificare nel comando
export ALLOWED_UDP_HOSTS="192.168.1.0/24,127.0.0.1"
./target/release/cot-proxy
```

**Nota**: 
- Senza configurazione, il proxy permette tutte le destinazioni (modalità sviluppo).
- Il supporto CIDR è semplificato e implementato sia nella versione Rust che Node.js.

### Raccomandazioni di Sicurezza

⚠️ Questa applicazione trasmette dati di posizione. Per uso in produzione:
- ✅ Configura `ALLOWED_UDP_HOSTS` per limitare le destinazioni
- ✅ Usa HTTPS/TLS per la connessione PWA-Proxy
- ✅ Implementa autenticazione al proxy server
- ✅ Usa firewall per limitare l'accesso al proxy
- ✅ Considera la cifratura dei messaggi CoT se necessario
- ✅ Monitora i log del proxy per attività sospette

## Troubleshooting

**Il proxy non si avvia:**
- Verifica che Rust sia installato (`rustc --version`) per la versione Rust
- Verifica che Node.js sia installato (`node --version`) per la versione Node.js
- Verifica che la porta 8080 sia disponibile
- Compila il progetto Rust con `cargo build --release` prima di eseguire

**Errori di invio UDP:**
- Verifica che il proxy server sia in esecuzione
- Verifica che l'indirizzo proxy sia corretto nell'app
- Controlla i log del proxy server per dettagli

**Geolocalizzazione non funziona:**
- Concedi i permessi di localizzazione al browser
- Usa HTTPS o localhost
- Verifica che il dispositivo abbia il GPS attivo

## Licenza

Vedi file LICENSE
