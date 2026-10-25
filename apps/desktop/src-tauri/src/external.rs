//! Opens links from Settings → Contribute in the system browser.
//!
//! Only `https://github.com/…` is allowed: the address comes from the page, and passing any string
//! to the system opener would run whatever the page sends.

use std::process::Command;

fn allowed(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://github.com/") else {
        return false;
    };
    // No control characters or quotes: the address is passed as one argument, never through a shell.
    !rest
        .chars()
        .any(|c| c.is_control() || c == '"' || c == '\'' || c == ' ')
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    if !allowed(&url) {
        return Err("That address is not opened from here.".into());
    }
    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut c = Command::new("rundll32");
        c.arg("url.dll,FileProtocolHandler");
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = Command::new("xdg-open");

    command
        .arg(&url)
        .spawn()
        .map(|_| ())
        .map_err(|_| "The browser could not be opened.".into())
}

#[cfg(test)]
mod tests {
    use super::allowed;

    #[test]
    fn only_github_over_https_is_opened() {
        assert!(allowed(
            "https://github.com/ProfessorEngineergit/bezier/issues/new?body=a%20b"
        ));
        assert!(!allowed("http://github.com/x"));
        assert!(!allowed("https://github.com.evil.example/x"));
        assert!(!allowed("https://example.com/"));
        assert!(!allowed("file:///etc/passwd"));
        assert!(!allowed("https://github.com/a b"));
    }
}
