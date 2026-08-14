use std::{
    io::{self, Read},
    net::{Ipv4Addr, Ipv6Addr, SocketAddr, SocketAddrV4, SocketAddrV6, TcpListener},
    path::Path,
    sync::Arc,
    thread,
    time::Duration,
};

use percent_encoding::percent_decode_str;
use reqwest::{
    blocking::{Client, RequestBuilder},
    header::{HeaderName, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_TYPE, SET_COOKIE, VARY},
    redirect::Policy,
};
use socket2::{Domain, Protocol, Socket, Type};
use tauri::Url;
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

use crate::live_shell::LiveShell;

const DESKTOP_PORT_START: u16 = 3001;
const DESKTOP_PORT_END: u16 = 3010;
/// Request handler threads per listener.
const REQUEST_WORKERS: usize = 8;
const MAX_API_REQUEST_BYTES: usize = 5 * 1024 * 1024;
const MAX_API_RESPONSE_BYTES: usize = 64 * 1024 * 1024;
// Mirrors the deployed web policy for the directives that only affect rendering, so the desktop
// window is not quietly stricter than the site it serves. Origin isolation is unchanged: every
// source stays `'self'` plus the inline-style and IPC allowances the shell has always needed.
const DESKTOP_CSP: &str = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'none'; frame-ancestors 'none'";
const BACKEND_UNAVAILABLE: &str =
    r#"{"success":false,"data":null,"error":"DESKTOP_BACKEND_UNAVAILABLE"}"#;
const BACKEND_INVALID_RESPONSE: &str =
    r#"{"success":false,"data":null,"error":"DESKTOP_BACKEND_INVALID_RESPONSE"}"#;
const FORWARDED_REQUEST_HEADERS: &[&str] = &[
    "accept",
    "accept-language",
    "content-type",
    "cookie",
    "if-match",
    "if-none-match",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "user-agent",
    "x-csrf-token",
];

use crate::live_shell::backend_origin;

pub fn start(shell: Arc<LiveShell>) -> Result<Url, String> {
    let (port, listeners) = bind_loopback_listeners().map_err(|error| {
        format!(
            "Millennium Desktop could not reserve a loopback port from {DESKTOP_PORT_START} to {DESKTOP_PORT_END}: {error}"
        )
    })?;
    let desktop_host = format!("localhost:{port}");
    let desktop_origin = format!("http://{desktop_host}");
    let client = Arc::new(
        Client::builder()
            .redirect(Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(210))
            .build()
            .map_err(|error| format!("Failed to initialize local API proxy: {error}"))?,
    );

    for (name, listener) in listeners {
        let server = Arc::new(
            Server::from_listener(listener, None)
                .map_err(|error| format!("Failed to start {name} desktop listener: {error}"))?,
        );
        // A fixed pool rather than one thread per listener. Serving requests sequentially meant a
        // single proxied API call — which may wait on the backend for minutes — stalled every
        // asset and every other API call behind it, and a page load asks for many chunks at once.
        // The pool is bounded, so a burst of connections still cannot spawn threads without limit.
        for worker in 0..REQUEST_WORKERS {
            let worker_server = Arc::clone(&server);
            let worker_shell = Arc::clone(&shell);
            let worker_client = Arc::clone(&client);
            let worker_host = desktop_host.clone();
            let worker_origin = desktop_origin.clone();
            thread::Builder::new()
                .name(format!("millennium-{name}-server-{worker}"))
                .spawn(move || loop {
                    let Ok(request) = worker_server.recv() else {
                        // The listener is gone, which only happens while the app is shutting down.
                        break;
                    };
                    handle_request(
                        request,
                        worker_shell.as_ref(),
                        worker_client.as_ref(),
                        &worker_host,
                        &worker_origin,
                    );
                })
                .map_err(|error| format!("Failed to start {name} desktop server thread: {error}"))?;
        }
    }

    Url::parse(&desktop_origin)
        .map_err(|error| format!("Failed to prepare desktop window URL: {error}"))
}

fn bind_loopback_listeners() -> io::Result<(u16, Vec<(&'static str, TcpListener)>)> {
    let mut last_error = None;
    for port in DESKTOP_PORT_START..=DESKTOP_PORT_END {
        match bind_loopback_port(port) {
            Ok(listeners) => return Ok((port, listeners)),
            Err(error) => last_error = Some(error),
        }
    }
    Err(last_error.unwrap_or_else(|| io::Error::other("no loopback ports were attempted")))
}

fn bind_loopback_port(port: u16) -> io::Result<Vec<(&'static str, TcpListener)>> {
    let ipv6_socket = Socket::new(Domain::IPV6, Type::STREAM, Some(Protocol::TCP))?;
    ipv6_socket.set_only_v6(true)?;
    ipv6_socket.bind(&SocketAddr::V6(SocketAddrV6::new(Ipv6Addr::LOCALHOST, port, 0, 0)).into())?;
    ipv6_socket.listen(128)?;
    let ipv6_listener: TcpListener = ipv6_socket.into();

    let ipv4_listener =
        TcpListener::bind(SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port)))?;

    Ok(vec![("ipv4", ipv4_listener), ("ipv6", ipv6_listener)])
}

fn handle_request(
    mut request: Request,
    shell: &LiveShell,
    client: &Client,
    desktop_host: &str,
    desktop_origin: &str,
) {
    let response = build_response(&mut request, shell, client, desktop_host, desktop_origin);
    let _ = request.respond(response);
}

fn build_response(
    request: &mut Request,
    shell: &LiveShell,
    client: &Client,
    desktop_host: &str,
    desktop_origin: &str,
) -> Response<std::io::Cursor<Vec<u8>>> {
    if !request
        .remote_addr()
        .is_some_and(|address| address.ip().is_loopback())
    {
        return text_response(403, "Forbidden", "text/plain; charset=utf-8", false);
    }

    let host = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Host"))
        .map(|header| header.value.as_str());
    if host != Some(desktop_host) {
        return text_response(
            421,
            "Misdirected Request",
            "text/plain; charset=utf-8",
            false,
        );
    }

    let raw_url = request.url().to_owned();
    if !raw_url.starts_with('/')
        || raw_url.starts_with("//")
        || raw_url.contains('#')
        || raw_url.chars().any(char::is_control)
    {
        return text_response(
            400,
            "Invalid request target",
            "text/plain; charset=utf-8",
            false,
        );
    }

    let encoded_path = raw_url.split('?').next().unwrap_or("/");
    let decoded_path = match percent_decode_str(encoded_path).decode_utf8() {
        Ok(path) => path,
        Err(_) => {
            return text_response(
                400,
                "Invalid path encoding",
                "text/plain; charset=utf-8",
                false,
            )
        }
    };
    if decoded_path.contains('\\')
        || decoded_path
            .split('/')
            .any(|segment| segment == "." || segment == "..")
    {
        return text_response(400, "Invalid path", "text/plain; charset=utf-8", false);
    }

    if decoded_path == "/api" || decoded_path.starts_with("/api/") {
        let origin = request
            .headers()
            .iter()
            .find(|header| header.field.equiv("Origin"))
            .map(|header| header.value.as_str());
        let fetch_site = request
            .headers()
            .iter()
            .find(|header| header.field.equiv("Sec-Fetch-Site"))
            .map(|header| header.value.as_str());
        let is_mutation = !matches!(
            request.method(),
            Method::Get | Method::Head | Method::Options
        );
        if fetch_site == Some("cross-site")
            || origin.is_some_and(|value| value != desktop_origin)
            || (is_mutation && origin != Some(desktop_origin))
        {
            return text_response(403, "Forbidden", "text/plain; charset=utf-8", false);
        }
        return proxy_api_request(request, client, &raw_url);
    }

    if !matches!(request.method(), Method::Get | Method::Head) {
        return text_response(
            405,
            "Method Not Allowed",
            "text/plain; charset=utf-8",
            false,
        );
    }

    let requested_path = decoded_path.trim_start_matches('/');
    let asset_path = if requested_path.is_empty() {
        "index.html"
    } else {
        requested_path
    };
    let has_file_extension = Path::new(asset_path).extension().is_some();
    let resolved_path = if has_file_extension {
        asset_path
    } else {
        "index.html"
    };
    let Some(asset) = shell.resolve(resolved_path) else {
        return text_response(404, "Not Found", "text/plain; charset=utf-8", false);
    };

    if has_file_extension && asset.mime_type == "text/html" && !asset_path.ends_with(".html") {
        return text_response(404, "Not Found", "text/plain; charset=utf-8", false);
    }

    let content_length = asset.bytes.len();
    let body = if matches!(request.method(), Method::Head) {
        Vec::new()
    } else {
        asset.bytes
    };
    let cache_control = if resolved_path == "index.html" {
        "no-store"
    } else if resolved_path.starts_with("_app-assets/") {
        "public, max-age=31536000, immutable"
    } else {
        "public, max-age=3600"
    };
    let csp = asset.csp_header.as_deref().unwrap_or(DESKTOP_CSP);

    response_with_headers(
        200,
        body,
        &asset.mime_type,
        content_length,
        cache_control,
        csp,
    )
}

fn proxy_api_request(
    request: &mut Request,
    client: &Client,
    raw_url: &str,
) -> Response<std::io::Cursor<Vec<u8>>> {
    let method = match request.method() {
        Method::Get => reqwest::Method::GET,
        Method::Head => reqwest::Method::HEAD,
        Method::Post => reqwest::Method::POST,
        Method::Put => reqwest::Method::PUT,
        Method::Patch => reqwest::Method::PATCH,
        Method::Delete => reqwest::Method::DELETE,
        Method::Options => reqwest::Method::OPTIONS,
        _ => {
            return text_response(
                405,
                "Method Not Allowed",
                "text/plain; charset=utf-8",
                false,
            )
        }
    };
    if request
        .body_length()
        .is_some_and(|length| length > MAX_API_REQUEST_BYTES)
    {
        return text_response(
            413,
            "Request body is too large",
            "text/plain; charset=utf-8",
            false,
        );
    }

    let mut body = Vec::new();
    if request
        .as_reader()
        .take((MAX_API_REQUEST_BYTES + 1) as u64)
        .read_to_end(&mut body)
        .is_err()
    {
        return text_response(
            400,
            "Failed to read request body",
            "text/plain; charset=utf-8",
            false,
        );
    }
    if body.len() > MAX_API_REQUEST_BYTES {
        return text_response(
            413,
            "Request body is too large",
            "text/plain; charset=utf-8",
            false,
        );
    }

    let upstream_origin = backend_origin();
    let target = format!("{upstream_origin}{raw_url}");
    let mut upstream = client.request(method, target);
    upstream = forward_request_headers(upstream, request);
    upstream = upstream
        .header("origin", upstream_origin)
        .header("referer", format!("{upstream_origin}/"))
        .header("sec-fetch-site", "same-origin");
    if !body.is_empty() {
        upstream = upstream.body(body);
    }

    let Ok(response) = upstream.send() else {
        return text_response(
            503,
            BACKEND_UNAVAILABLE,
            "application/json; charset=utf-8",
            matches!(request.method(), Method::Head),
        );
    };
    if response.status().is_redirection() {
        return text_response(
            502,
            BACKEND_INVALID_RESPONSE,
            "application/json; charset=utf-8",
            matches!(request.method(), Method::Head),
        );
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_API_RESPONSE_BYTES as u64)
    {
        return text_response(
            502,
            "Backend response is too large",
            "text/plain; charset=utf-8",
            false,
        );
    }

    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/json; charset=utf-8")
        .to_owned();
    if raw_url.split('?').next() == Some("/api/portal/login")
        && !content_type
            .to_ascii_lowercase()
            .starts_with("application/json")
    {
        return text_response(
            502,
            BACKEND_INVALID_RESPONSE,
            "application/json; charset=utf-8",
            matches!(request.method(), Method::Head),
        );
    }
    let cache_control = response
        .headers()
        .get(CACHE_CONTROL)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("no-store")
        .to_owned();
    let vary = response
        .headers()
        .get(VARY)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let set_cookies = response
        .headers()
        .get_all(SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok().map(str::to_owned))
        .collect::<Vec<_>>();
    let declared_length = response
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<usize>().ok());
    let mut body = Vec::new();
    if response
        .take((MAX_API_RESPONSE_BYTES + 1) as u64)
        .read_to_end(&mut body)
        .is_err()
        || body.len() > MAX_API_RESPONSE_BYTES
    {
        return text_response(
            502,
            "Backend response is too large",
            "text/plain; charset=utf-8",
            false,
        );
    }
    // tiny_http treats a `Content-Length` header as the authoritative body size, so an upstream
    // value that disagrees with the bytes actually read would truncate or stall the response.
    // Only a HEAD, whose body is intentionally dropped, may report the upstream length.
    let is_head = matches!(request.method(), Method::Head);
    let body_length = if is_head {
        declared_length.unwrap_or(body.len())
    } else {
        body.len()
    };
    let body = if is_head { Vec::new() } else { body };
    let mut proxied = response_with_headers(
        status,
        body,
        &content_type,
        body_length,
        &cache_control,
        DESKTOP_CSP,
    );
    if let Some(vary) = vary {
        proxied.add_header(header("Vary", &vary));
    }
    for cookie in set_cookies {
        proxied.add_header(header("Set-Cookie", &cookie));
    }
    proxied
}

fn forward_request_headers(mut builder: RequestBuilder, request: &Request) -> RequestBuilder {
    for incoming in request.headers() {
        let name = incoming.field.as_str().as_str().to_ascii_lowercase();
        if !FORWARDED_REQUEST_HEADERS.contains(&name.as_str()) {
            continue;
        }
        let Ok(header_name) = HeaderName::from_bytes(name.as_bytes()) else {
            continue;
        };
        builder = builder.header(header_name, incoming.value.as_str());
    }
    builder
}

fn text_response(
    status: u16,
    body: &str,
    content_type: &str,
    is_head: bool,
) -> Response<std::io::Cursor<Vec<u8>>> {
    let bytes = body.as_bytes();
    response_with_headers(
        status,
        if is_head { Vec::new() } else { bytes.to_vec() },
        content_type,
        bytes.len(),
        "no-store",
        DESKTOP_CSP,
    )
}

fn response_with_headers(
    status: u16,
    body: Vec<u8>,
    content_type: &str,
    content_length: usize,
    cache_control: &str,
    csp: &str,
) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_data(body)
        .with_status_code(StatusCode(status))
        .with_header(header("Content-Type", content_type))
        .with_header(header("Content-Length", &content_length.to_string()))
        .with_header(header("Cache-Control", cache_control))
        .with_header(header("Content-Security-Policy", csp))
        .with_header(header("X-Content-Type-Options", "nosniff"))
        .with_header(header("Referrer-Policy", "no-referrer"))
        .with_header(header("Cross-Origin-Resource-Policy", "same-origin"))
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid static response header")
}
