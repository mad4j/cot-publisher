/**
 * CoT Publisher Application
 * Main application logic for the PWA
 */

class CoTPublisher {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.messageCount = 0;
        this.currentPosition = null;
        this.watchId = null;
        this.cotGenerator = null;
        
        // Constants
        this.POSITION_WAIT_MS = 1000; // Time to wait for initial position
        this.MAX_LOG_ENTRIES = 50; // Maximum number of log entries to keep
        
        this.initializeElements();
        this.initializeEventListeners();
        this.initializeServiceWorker();
        this.log('Applicazione inizializzata', 'success');
    }

    /**
     * Initialize DOM element references
     */
    initializeElements() {
        this.elements = {
            proxyAddress: document.getElementById('proxyAddress'),
            udpHost: document.getElementById('udpHost'),
            udpPort: document.getElementById('udpPort'),
            callsign: document.getElementById('callsign'),
            team: document.getElementById('team'),
            role: document.getElementById('role'),
            uid: document.getElementById('uid'),
            interval: document.getElementById('interval'),
            status: document.getElementById('status'),
            position: document.getElementById('position'),
            messageCount: document.getElementById('messageCount'),
            lastSent: document.getElementById('lastSent'),
            startBtn: document.getElementById('startBtn'),
            pauseBtn: document.getElementById('pauseBtn'),
            log: document.getElementById('log')
        };
    }

    /**
     * Initialize event listeners for buttons
     */
    initializeEventListeners() {
        this.elements.startBtn.addEventListener('click', () => this.start());
        this.elements.pauseBtn.addEventListener('click', () => this.pause());
    }

    /**
     * Initialize service worker for PWA functionality
     */
    initializeServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('service-worker.js')
                .then(registration => {
                    this.log('Service Worker registrato', 'success');
                })
                .catch(error => {
                    this.log(`Errore Service Worker: ${error.message}`, 'error');
                });
        }
    }

    /**
     * Log a message to the log display
     */
    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString('it-IT');
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        this.elements.log.appendChild(logEntry);
        
        // Keep only last MAX_LOG_ENTRIES log entries
        while (this.elements.log.children.length > this.MAX_LOG_ENTRIES) {
            this.elements.log.removeChild(this.elements.log.firstChild);
        }
        
        // Scroll to bottom
        this.elements.log.scrollTop = this.elements.log.scrollHeight;
    }

    /**
     * Update the status display
     */
    updateStatus(status) {
        this.elements.status.textContent = status;
    }

    /**
     * Update the position display
     */
    updatePositionDisplay() {
        if (this.currentPosition) {
            const lat = this.currentPosition.lat.toFixed(6);
            const lon = this.currentPosition.lon.toFixed(6);
            const alt = this.currentPosition.alt.toFixed(1);
            this.elements.position.textContent = `${lat}, ${lon} (${alt}m)`;
        } else {
            this.elements.position.textContent = 'In attesa...';
        }
    }

    /**
     * Start tracking position
     */
    startPositionTracking() {
        if (!navigator.geolocation) {
            this.log('Geolocalizzazione non supportata', 'error');
            return false;
        }

        this.watchId = navigator.geolocation.watchPosition(
            (position) => {
                this.currentPosition = {
                    lat: position.coords.latitude,
                    lon: position.coords.longitude,
                    alt: position.coords.altitude || 0,
                    accuracy: position.coords.accuracy,
                    speed: position.coords.speed || 0,
                    heading: position.coords.heading || 0
                };
                this.updatePositionDisplay();
                this.log('Posizione aggiornata', 'success');
            },
            (error) => {
                this.log(`Errore geolocalizzazione: ${error.message}`, 'error');
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 5000
            }
        );

        return true;
    }

    /**
     * Stop tracking position
     */
    stopPositionTracking() {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
    }

    /**
     * Send CoT message via UDP (through proxy server)
     */
    async sendCoTMessage() {
        if (!this.currentPosition) {
            this.log('Nessuna posizione disponibile', 'warning');
            return;
        }

        const config = {
            callsign: this.elements.callsign.value,
            team: this.elements.team.value,
            role: this.elements.role.value,
            uid: this.elements.uid.value
        };

        if (!this.cotGenerator) {
            this.cotGenerator = new CoTMessage(config);
        } else {
            this.cotGenerator.updateConfig(config);
        }

        const cotMessage = this.cotGenerator.generateMessage(this.currentPosition);
        const proxyAddress = this.elements.proxyAddress.value;
        const udpHost = this.elements.udpHost.value;
        const udpPort = this.elements.udpPort.value;

        // Use same protocol as current page (http or https)
        const protocol = window.location.protocol === 'https:' ? 'https' : 'http';

        try {
            // Send via HTTP/HTTPS to proxy, which forwards via UDP
            const response = await fetch(`${protocol}://${proxyAddress}/cot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/xml',
                    'X-UDP-Host': udpHost,
                    'X-UDP-Port': udpPort
                },
                body: cotMessage
            });

            if (response.ok) {
                const result = await response.json();
                this.messageCount++;
                this.elements.messageCount.textContent = this.messageCount;
                this.elements.lastSent.textContent = new Date().toLocaleTimeString('it-IT');
                this.log(`Messaggio UDP inviato a ${udpHost}:${udpPort} (${result.size} bytes)`, 'success');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            this.log(`Errore invio UDP: ${error.message}`, 'error');
        }
    }

    /**
     * Start publishing CoT messages
     */
    async start() {
        if (this.isRunning) {
            return;
        }

        // Validate proxy address
        const proxyAddress = this.elements.proxyAddress.value.trim();
        if (!proxyAddress) {
            this.log('Inserire un indirizzo proxy valido', 'error');
            return;
        }

        // Validate UDP destination
        const udpHost = this.elements.udpHost.value.trim();
        const udpPort = parseInt(this.elements.udpPort.value, 10);
        if (!udpHost || !udpPort || udpPort < 1 || udpPort > 65535) {
            this.log('Inserire indirizzo e porta UDP validi', 'error');
            return;
        }

        // Start position tracking
        if (!this.startPositionTracking()) {
            this.log('Impossibile avviare il tracciamento della posizione', 'error');
            return;
        }

        this.isRunning = true;
        this.updateStatus('Attivo ⚡');
        this.elements.startBtn.disabled = true;
        this.elements.pauseBtn.disabled = false;

        // Disable configuration inputs while running
        this.elements.proxyAddress.disabled = true;
        this.elements.udpHost.disabled = true;
        this.elements.udpPort.disabled = true;
        this.elements.callsign.disabled = true;
        this.elements.team.disabled = true;
        this.elements.role.disabled = true;
        this.elements.uid.disabled = true;
        this.elements.interval.disabled = true;

        this.log('Pubblicazione avviata', 'success');

        // Wait for position to be available
        await new Promise(resolve => setTimeout(resolve, this.POSITION_WAIT_MS));

        // Send first message immediately
        await this.sendCoTMessage();

        // Set up interval for subsequent messages
        const intervalSeconds = parseInt(this.elements.interval.value, 10);
        this.intervalId = setInterval(() => {
            this.sendCoTMessage();
        }, intervalSeconds * 1000);
    }

    /**
     * Pause publishing CoT messages
     */
    pause() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;
        this.updateStatus('In pausa ⏸️');
        this.elements.startBtn.disabled = false;
        this.elements.pauseBtn.disabled = true;

        // Enable configuration inputs
        this.elements.proxyAddress.disabled = false;
        this.elements.udpHost.disabled = false;
        this.elements.udpPort.disabled = false;
        this.elements.callsign.disabled = false;
        this.elements.team.disabled = false;
        this.elements.role.disabled = false;
        this.elements.uid.disabled = false;
        this.elements.interval.disabled = false;

        // Clear interval and stop position tracking
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.stopPositionTracking();
        this.log('Pubblicazione in pausa', 'warning');
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.cotPublisher = new CoTPublisher();
});
