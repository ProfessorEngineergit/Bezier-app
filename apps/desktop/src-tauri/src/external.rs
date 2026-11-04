//! Hands things to the system: links from Settings → Contribute to the browser, a 3MF to the slicer.
//!
//! Only `https://github.com/…` is allowed: the address comes from the page, and passing any string
//! to the system opener would run whatever the page sends.

use std::process::Command;

use base64::{engine::general_purpose::STANDARD, Engine as _};

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

/// Keeps what is safe in a file name, so a project's name cannot point anywhere else.
fn safe_name(name: &str) -> String {
    let stem = name.strip_suffix(".3mf").unwrap_or(name);
    let kept: String = stem
        .chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, ' ' | '-' | '_'))
        .take(80)
        .collect();
    let trimmed = kept.trim();
    format!("{}.3mf", if trimmed.is_empty() { "Bezier" } else { trimmed })
}

/// Enough for a large model, and a ceiling on what one call can hold.
const SLICER_LIMIT: usize = 512_000_000;

/// Writes the model where temporary files go and lets the system open it. Only ever a `.3mf`, so
/// nothing the page sends can be run: the system hands it to whatever opens such files.
#[tauri::command]
pub fn open_in_slicer(name: String, data: String) -> Result<String, String> {
    if data.len() > SLICER_LIMIT {
        return Err("That file is too large to open.".into());
    }
    let bytes = STANDARD
        .decode(data.as_bytes())
        .map_err(|_| "The file could not be decoded.")?;
    let folder = std::env::temp_dir().join("bezier-print");
    std::fs::create_dir_all(&folder).map_err(|_| "No place to put the file.")?;
    let path = folder.join(safe_name(&name));
    std::fs::write(&path, bytes).map_err(|_| "The file could not be written.")?;

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
        .arg(&path)
        .spawn()
        .map_err(|_| "No app here opens 3MF files. Install a slicer and try again.")?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::{allowed, safe_name};

    #[test]
    fn a_name_cannot_leave_the_folder_or_change_kind() {
        assert_eq!(safe_name("Bracket 2.3mf"), "Bracket 2.3mf");
        assert_eq!(safe_name("../../etc/passwd"), "etcpasswd.3mf");
        assert_eq!(safe_name("run.command"), "runcommand.3mf");
        assert_eq!(safe_name("///"), "Bezier.3mf");
    }

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
