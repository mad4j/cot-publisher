use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{body::Incoming, header, Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use http_body_util::{BodyExt, Full};
use hyper::body::Bytes;
use serde::Serialize;
use std::convert::Infallible;
use std::env;
use std::net::{SocketAddr, UdpSocket};
use std::sync::Arc;
use tokio::net::TcpListener;

#[derive(Serialize)]
struct SuccessResponse {
    success: bool,
    destination: String,
    size: usize,
}

#[derive(Serialize)]
struct ErrorResponse {
    success: bool,
    error: String,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    service: String,
    version: String,
}

/// Configuration for allowed UDP hosts
struct ProxyConfig {
    allowed_hosts: Option<Vec<String>>,
}

impl ProxyConfig {
    fn new() -> Self {
        let allowed_hosts = env::var("ALLOWED_UDP_HOSTS")
            .ok()
            .map(|s| s.split(',').map(|h| h.trim().to_string()).collect());
        
        ProxyConfig { allowed_hosts }
    }

    /// Check if an IP address is allowed based on the allowlist
    fn is_allowed_host(&self, ip: &str) -> bool {
        match &self.allowed_hosts {
            None => true, // No restrictions, allow all (development mode)
            Some(allowed) => {
                for allowed_pattern in allowed {
                    if allowed_pattern == ip {
                        return true;
                    }
                    // Simple CIDR check for common cases
                    if allowed_pattern.contains('/') {
                        let parts: Vec<&str> = allowed_pattern.split('/').collect();
                        if parts.len() == 2 {
                            let network = parts[0];
                            // Basic prefix matching for CIDR
                            let network_parts: Vec<&str> = network.split('.').collect();
                            let ip_parts: Vec<&str> = ip.split('.').collect();
                            
                            if network_parts.len() >= 3 && ip_parts.len() == 4 {
                                let prefix: Vec<String> = network_parts[..network_parts.len()-1]
                                    .iter()
                                    .map(|s| s.to_string())
                                    .collect();
                                let ip_prefix: Vec<String> = ip_parts[..prefix.len()]
                                    .iter()
                                    .map(|s| s.to_string())
                                    .collect();
                                
                                if prefix == ip_prefix {
                                    return true;
                                }
                            }
                        }
                    }
                }
                false
            }
        }
    }
}

async fn handle_request(
    req: Request<Incoming>,
    config: Arc<ProxyConfig>,
) -> Result<Response<Full<Bytes>>, Infallible> {
    // Set CORS headers
    let response_builder = Response::builder()
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_ALLOW_METHODS, "POST, OPTIONS")
        .header(
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            "Content-Type, X-UDP-Host, X-UDP-Port",
        );

    // Handle preflight requests
    if req.method() == Method::OPTIONS {
        return Ok(response_builder
            .status(StatusCode::OK)
            .body(Full::new(Bytes::new()))
            .unwrap());
    }

    // Handle GET / (health check)
    if req.method() == Method::GET && req.uri().path() == "/" {
        let health = HealthResponse {
            status: "running".to_string(),
            service: "CoT UDP Proxy".to_string(),
            version: "1.0.0".to_string(),
        };
        let json = serde_json::to_string(&health).unwrap();
        return Ok(response_builder
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "application/json")
            .body(Full::new(Bytes::from(json)))
            .unwrap());
    }

    // Handle POST /cot
    if req.method() == Method::POST && req.uri().path() == "/cot" {
        // Get UDP destination from headers (extract before consuming body)
        let udp_host = req.headers()
            .get("x-udp-host")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("127.0.0.1")
            .to_string();
        
        let udp_port: u16 = req.headers()
            .get("x-udp-port")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse().ok())
            .unwrap_or(8087);

        // Validate UDP destination
        if !config.is_allowed_host(&udp_host) {
            eprintln!("Blocked UDP destination: {} (not in allowlist)", udp_host);
            let error = ErrorResponse {
                success: false,
                error: "UDP destination not allowed. Configure ALLOWED_UDP_HOSTS environment variable.".to_string(),
            };
            let json = serde_json::to_string(&error).unwrap();
            return Ok(response_builder
                .status(StatusCode::FORBIDDEN)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Full::new(Bytes::from(json)))
                .unwrap());
        }

        // Validate port range
        if udp_port < 1 {
            eprintln!("Invalid UDP port: {}", udp_port);
            let error = ErrorResponse {
                success: false,
                error: "Invalid UDP port number".to_string(),
            };
            let json = serde_json::to_string(&error).unwrap();
            return Ok(response_builder
                .status(StatusCode::BAD_REQUEST)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Full::new(Bytes::from(json)))
                .unwrap());
        }

        // Read the body
        let body = req.into_body();
        let body_bytes = match body.collect().await {
            Ok(collected) => collected.to_bytes(),
            Err(e) => {
                eprintln!("Error reading body: {}", e);
                let error = ErrorResponse {
                    success: false,
                    error: format!("Error reading body: {}", e),
                };
                let json = serde_json::to_string(&error).unwrap();
                return Ok(response_builder
                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Full::new(Bytes::from(json)))
                    .unwrap());
            }
        };

        // Send UDP packet
        let destination = format!("{}:{}", udp_host, udp_port);
        match UdpSocket::bind("0.0.0.0:0") {
            Ok(socket) => {
                match socket.send_to(&body_bytes, &destination) {
                    Ok(_) => {
                        println!(
                            "Forwarded CoT message to {} ({} bytes)",
                            destination,
                            body_bytes.len()
                        );
                        let success = SuccessResponse {
                            success: true,
                            destination: destination.clone(),
                            size: body_bytes.len(),
                        };
                        let json = serde_json::to_string(&success).unwrap();
                        return Ok(response_builder
                            .status(StatusCode::OK)
                            .header(header::CONTENT_TYPE, "application/json")
                            .body(Full::new(Bytes::from(json)))
                            .unwrap());
                    }
                    Err(e) => {
                        eprintln!("UDP send error: {}", e);
                        let error = ErrorResponse {
                            success: false,
                            error: format!("UDP send error: {}", e),
                        };
                        let json = serde_json::to_string(&error).unwrap();
                        return Ok(response_builder
                            .status(StatusCode::INTERNAL_SERVER_ERROR)
                            .header(header::CONTENT_TYPE, "application/json")
                            .body(Full::new(Bytes::from(json)))
                            .unwrap());
                    }
                }
            }
            Err(e) => {
                eprintln!("Error creating UDP socket: {}", e);
                let error = ErrorResponse {
                    success: false,
                    error: format!("Error creating UDP socket: {}", e),
                };
                let json = serde_json::to_string(&error).unwrap();
                return Ok(response_builder
                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Full::new(Bytes::from(json)))
                    .unwrap());
            }
        }
    }

    // 404 for other routes
    let error = ErrorResponse {
        success: false,
        error: "Not found".to_string(),
    };
    let json = serde_json::to_string(&error).unwrap();
    Ok(response_builder
        .status(StatusCode::NOT_FOUND)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Full::new(Bytes::from(json)))
        .unwrap())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Get port from environment or use default
    let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse()?;

    // Initialize configuration
    let config = Arc::new(ProxyConfig::new());

    // Print startup banner
    println!("==============================================");
    println!("  CoT UDP Proxy Server (Rust)");
    println!("==============================================");
    println!("  HTTP Server listening on port {}", port);
    println!("  Endpoint: http://localhost:{}/cot", port);
    println!();
    println!("  Security:");
    if let Some(ref allowed) = config.allowed_hosts {
        println!("    Allowed UDP destinations: {}", allowed.join(", "));
    } else {
        println!("    ⚠️  All UDP destinations allowed (development mode)");
        println!("    Set ALLOWED_UDP_HOSTS env var for production");
    }
    println!();
    println!("  Usage:");
    println!("    POST /cot with headers:");
    println!("      X-UDP-Host: <destination-ip>");
    println!("      X-UDP-Port: <destination-port>");
    println!("      Content-Type: application/xml");
    println!();
    println!("  Press Ctrl+C to stop");
    println!("==============================================");

    let listener = TcpListener::bind(addr).await?;

    loop {
        let (stream, _) = listener.accept().await?;
        let io = TokioIo::new(stream);
        let config_clone = Arc::clone(&config);

        tokio::task::spawn(async move {
            if let Err(err) = http1::Builder::new()
                .serve_connection(io, service_fn(move |req| {
                    let config = Arc::clone(&config_clone);
                    handle_request(req, config)
                }))
                .await
            {
                eprintln!("Error serving connection: {:?}", err);
            }
        });
    }
}
