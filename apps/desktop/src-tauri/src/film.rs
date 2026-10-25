//! Serves the intro film to the Linux and Windows web views over HTTP on 127.0.0.1, on a port the
//! system picks. Only that one file is served.
//!
//! WebKitGTK plays video through GStreamer: from the app's own pages (no byte ranges) a WebM blob
//! seeks to its end or never starts, and from `asset://` it does not load at all. Over HTTP with
//! byte ranges it plays. WebView2 shows 0:00 of 0:00 for the page's own files, so it gets the same
//! URL.

use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::thread;

/// Serves `file` at `/intro.webm` and returns its URL, or None if no port is available.
pub fn serve(file: PathBuf) -> Option<String> {
    let listener = TcpListener::bind("127.0.0.1:0").ok()?;
    let port = listener.local_addr().ok()?.port();
    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let file = file.clone();
            thread::spawn(move || {
                // The player retries failed connections.
                let _ = answer(stream, &file);
            });
        }
    });
    Some(format!("http://127.0.0.1:{port}/intro.webm"))
}

fn answer(mut stream: TcpStream, file: &PathBuf) -> std::io::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut first = String::new();
    reader.read_line(&mut first)?;
    let mut range: Option<(u64, Option<u64>)> = None;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line)? == 0 || line == "\r\n" || line == "\n" {
            break;
        }
        let lower = line.to_ascii_lowercase();
        if let Some(value) = lower.strip_prefix("range: bytes=") {
            let mut parts = value.trim().splitn(2, '-');
            let start = parts.next().and_then(|v| v.parse().ok());
            let end = parts.next().and_then(|v| v.trim().parse().ok());
            range = start.map(|start| (start, end));
        }
    }
    let mut words = first.split_whitespace();
    let method = words.next().unwrap_or("");
    let path = words.next().unwrap_or("");
    if (method != "GET" && method != "HEAD") || path != "/intro.webm" {
        return stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
    }
    let mut source = File::open(file)?;
    let size = source.metadata()?.len();
    let (start, end, status) = match range {
        Some((start, end)) if start < size => (
            start,
            end.unwrap_or(size - 1).min(size - 1),
            "206 Partial Content",
        ),
        Some(_) => {
            let head = format!(
                "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{size}\r\nContent-Length: 0\r\n\r\n"
            );
            return stream.write_all(head.as_bytes());
        }
        None => (0, size.saturating_sub(1), "200 OK"),
    };
    let length = end + 1 - start;
    let mut head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: video/webm\r\nAccept-Ranges: bytes\r\nContent-Length: {length}\r\nConnection: close\r\n"
    );
    if range.is_some() {
        head.push_str(&format!("Content-Range: bytes {start}-{end}/{size}\r\n"));
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes())?;
    if method == "HEAD" {
        return Ok(());
    }
    source.seek(SeekFrom::Start(start))?;
    std::io::copy(&mut source.take(length), &mut stream)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::serve;
    use std::io::{Read, Write};
    use std::net::TcpStream;

    fn get(url: &str, path: &str, extra: &str) -> String {
        let address = url.trim_start_matches("http://").split('/').next().unwrap_or_default();
        let mut stream = TcpStream::connect(address).expect("connects");
        write!(stream, "GET {path} HTTP/1.1\r\nHost: x\r\n{extra}\r\n").expect("asks");
        let mut answer = Vec::new();
        stream.read_to_end(&mut answer).expect("hears");
        String::from_utf8_lossy(&answer).into_owned()
    }

    #[test]
    fn answers_the_film_whole_and_in_ranges_and_nothing_else() {
        let file = std::env::temp_dir().join(format!("film-test-{}.webm", std::process::id()));
        std::fs::write(&file, b"0123456789").expect("writes");
        let url = serve(file.clone()).expect("serves");

        let whole = get(&url, "/intro.webm", "");
        assert!(whole.starts_with("HTTP/1.1 200"));
        assert!(whole.ends_with("\r\n\r\n0123456789"));

        let part = get(&url, "/intro.webm", "Range: bytes=2-5\r\n");
        assert!(part.starts_with("HTTP/1.1 206"));
        assert!(part.contains("Content-Range: bytes 2-5/10"));
        assert!(part.ends_with("\r\n\r\n2345"));

        let open_ended = get(&url, "/intro.webm", "Range: bytes=7-\r\n");
        assert!(open_ended.ends_with("\r\n\r\n789"));

        assert!(get(&url, "/etc/passwd", "").starts_with("HTTP/1.1 404"));
        assert!(get(&url, "/intro.webm", "Range: bytes=50-\r\n").starts_with("HTTP/1.1 416"));
        let _ = std::fs::remove_file(file);
    }
}
