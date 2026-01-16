/**
 * CoT (Cursor on Target) Message Generator
 * Generates CoT XML messages according to the CoT standard
 */

// Constants
const STALE_TIME_MS = 300000; // 5 minutes in milliseconds

class CoTMessage {
    constructor(config) {
        this.config = config;
        this.uid = config.uid || this.generateUID();
    }

    /**
     * Generate a unique identifier for the CoT message
     */
    generateUID() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `ANDROID-${timestamp}-${random}`;
    }

    /**
     * Format a date to CoT timestamp format (ISO 8601)
     */
    formatCoTTime(date) {
        return date.toISOString();
    }

    /**
     * Generate a CoT XML message from position data
     * @param {Object} position - Position object with lat, lon, alt, accuracy
     * @returns {string} CoT XML message
     */
    generateMessage(position) {
        const now = new Date();
        const stale = new Date(now.getTime() + STALE_TIME_MS);

        // CoT type for friendly ground unit
        const cotType = 'a-f-G-U-C';

        // Build the XML message
        const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<event version="2.0" uid="${this.uid}" type="${cotType}" time="${this.formatCoTTime(now)}" start="${this.formatCoTTime(now)}" stale="${this.formatCoTTime(stale)}" how="m-g">
    <point lat="${position.lat.toFixed(7)}" lon="${position.lon.toFixed(7)}" hae="${position.alt.toFixed(1)}" ce="${position.accuracy.toFixed(1)}" le="9999999.0"/>
    <detail>
        <contact callsign="${this.config.callsign || 'UNKNOWN'}"/>
        <__group name="${this.config.team || 'Cyan'}" role="${this.config.role || 'Team Member'}"/>
        <status battery="100"/>
        <takv device="CoT Publisher PWA" platform="Web Browser" os="WebAPI" version="1.0.0"/>
        <track speed="${position.speed || 0}" course="${position.heading || 0}"/>
    </detail>
</event>`;

        return xml;
    }

    /**
     * Update the UID for this CoT message generator
     */
    setUID(uid) {
        this.uid = uid || this.generateUID();
    }

    /**
     * Update the configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        if (config.uid !== undefined) {
            this.setUID(config.uid);
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CoTMessage;
}
