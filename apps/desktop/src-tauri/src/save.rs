//! Writing a file the web side produced, through a real macOS save panel.
//!
//! The panel is opened from a blocking task rather than from the caller's
//! thread: a modal panel needs the main thread to pump events, so blocking the
//! main thread on one hangs the app. For the same reason the webview's download
//! handler never opens one.

use std::path::Path;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri_plugin_dialog::DialogExt;

/// Enough for a long screen recording, and a ceiling on what one call can hold.
const LIMIT: usize = 512_000_000;

#[tauri::command]
pub async fn save_file(
    app: tauri::AppHandle,
    name: String,
    data: String,
) -> Result<Option<String>, String> {
    if data.len() > LIMIT {
        return Err("That file is too large to save.".into());
    }
    let bytes = STANDARD
        .decode(data.as_bytes())
        .map_err(|_| "The file could not be decoded.")?;

    tauri::async_runtime::spawn_blocking(move || {
        let extension = Path::new(&name)
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or_default()
            .to_owned();

        let mut panel = app.dialog().file().set_file_name(&name);
        if !extension.is_empty() {
            panel = panel.add_filter(extension.to_uppercase(), &[extension.as_str()]);
        }

        let Some(file) = panel.blocking_save_file() else {
            return Ok(None);
        };
        let path = file
            .into_path()
            .map_err(|_| "That location is not a local file.")?;
        std::fs::write(&path, &bytes)
            .map_err(|error| format!("The file could not be written: {error}"))?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|_| "The save panel could not finish.".to_string())?
}
