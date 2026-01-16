/**
 * CoT UDP Proxy Server
 * Receives CoT messages via HTTP POST and forwards them via UDP
 * 
 * This proxy is necessary because web browsers cannot send UDP packets directly.
 */

const http = require('http');
const dgram = require('dgram');
const url = require('url');

const PROXY_PORT = process.env.PORT || 8080;

// Create HTTP server
const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-UDP-Host, X-UDP-Port');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Handle POST requests to /cot endpoint
    if (req.method === 'POST' && req.url === '/cot') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            // Get UDP destination from headers
            const udpHost = req.headers['x-udp-host'] || '127.0.0.1';
            const udpPort = parseInt(req.headers['x-udp-port'] || '8087', 10);

            // Create UDP socket
            const client = dgram.createSocket('udp4');

            // Convert message to buffer
            const message = Buffer.from(body);

            // Send UDP packet
            client.send(message, 0, message.length, udpPort, udpHost, (err) => {
                if (err) {
                    console.error('UDP send error:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: false, 
                        error: err.message 
                    }));
                } else {
                    console.log(`Forwarded CoT message to ${udpHost}:${udpPort} (${message.length} bytes)`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: true,
                        destination: `${udpHost}:${udpPort}`,
                        size: message.length
                    }));
                }
                client.close();
            });
        });

        req.on('error', (err) => {
            console.error('Request error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
        });
    } else if (req.method === 'GET' && req.url === '/') {
        // Health check endpoint
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'running',
            service: 'CoT UDP Proxy',
            version: '1.0.0'
        }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
});

// Start the server
server.listen(PROXY_PORT, () => {
    console.log('==============================================');
    console.log('  CoT UDP Proxy Server');
    console.log('==============================================');
    console.log(`  HTTP Server listening on port ${PROXY_PORT}`);
    console.log(`  Endpoint: http://localhost:${PROXY_PORT}/cot`);
    console.log('');
    console.log('  Usage:');
    console.log('    POST /cot with headers:');
    console.log('      X-UDP-Host: <destination-ip>');
    console.log('      X-UDP-Port: <destination-port>');
    console.log('      Content-Type: application/xml');
    console.log('');
    console.log('  Press Ctrl+C to stop');
    console.log('==============================================');
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
    console.log('\nShutting down proxy server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
