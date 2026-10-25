//! Choosing files to import, through a real open panel.
//!
//! Opened from a blocking task, never from the caller's thread: a modal panel
//! needs the main thread to pump events, so opening one on it hangs the app
//! (as in `save.rs`).
//!
//! The bytes are read separately through `read_import` and arrive raw as an
//! `ArrayBuffer`; base64 inside JSON adds a third to the size and costs a slow
//! decode in the page.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::ipc::Response;
use tauri_plugin_dialog::DialogExt;

/// Solids, meshes and 2D drawings.
pub const GEOMETRY: [&str; 9] = [
    "step", "stp", "igs", "iges", "stl", "obj", "dxf", "svg", "bezier",
];

/// Pictures to place on a plane. The web view decodes them, so TIFF and HEIC support depends on
/// the system's decoders; the studio reports formats it cannot read.
pub const PICTURES: [&str; 17] = [
    "png", "jpg", "jpeg", "jpe", "jfif", "webp", "gif", "bmp", "dib", "ico", "cur", "avif", "apng",
    "tif", "tiff", "heic", "heif",
];

/// Whether the studio imports a file of this extension (any case).
pub fn importable(extension: &str) -> bool {
    let extension = extension.to_ascii_lowercase();
    GEOMETRY.contains(&extension.as_str()) || PICTURES.contains(&extension.as_str())
}

/// A ceiling per file, so one huge scan cannot exhaust the webview.
const LIMIT: u64 = 256_000_000;

/// Files the user chose in the open panel or opened from Finder, each readable
/// once by a one-time token.
///
/// The page never names a path, so `read_import` cannot be used to read
/// arbitrary files from disk.
#[derive(Default)]
pub struct Chosen {
    files: Mutex<HashMap<String, PathBuf>>,
    next: AtomicU64,
}

impl Chosen {
    /// Stores a chosen file and returns the token that reads it.
    pub fn offer(&self, path: PathBuf) -> String {
        let token = format!("import-{}", self.next.fetch_add(1, Ordering::Relaxed));
        if let Ok(mut files) = self.files.lock() {
            files.insert(token.clone(), path);
        }
        token
    }

    fn take(&self, token: &str) -> Option<PathBuf> {
        self.files.lock().ok()?.remove(token)
    }
}

/// The name a file is imported under.
pub fn display_name(path: &std::path::Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Import")
        .to_owned()
}

#[tauri::command]
pub async fn open_files(
    app: tauri::AppHandle,
    chosen: tauri::State<'_, Chosen>,
) -> Result<Vec<Value>, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter(
                "Everything Bezier opens",
                &GEOMETRY
                    .iter()
                    .chain(PICTURES.iter())
                    .copied()
                    .collect::<Vec<_>>(),
            )
            .add_filter("CAD files", &GEOMETRY)
            .add_filter("Pictures", &PICTURES)
            .blocking_pick_files()
    })
    .await
    .map_err(|_| "The open panel could not finish.".to_string())?;
    let Some(files) = picked else {
        return Ok(Vec::new());
    };
    let mut out = Vec::new();
    for file in files {
        let path = file
            .into_path()
            .map_err(|_| "That file is not a local file.".to_string())?;
        let name = display_name(&path);
        out.push(json!({ "name": name, "token": chosen.offer(path) }));
    }
    Ok(out)
}

/// The bytes of a chosen file, raw. Each token reads once.
#[tauri::command]
pub async fn read_import(
    token: String,
    chosen: tauri::State<'_, Chosen>,
) -> Result<Response, String> {
    let path = chosen
        .take(&token)
        .ok_or_else(|| "That file was not chosen to be imported.".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let size = std::fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
        if size > LIMIT {
            return Err(format!("{} is too large to import.", path.display()));
        }
        std::fs::read(&path)
            .map(Response::new)
            .map_err(|error| format!("The file could not be read: {error}"))
    })
    .await
    .map_err(|_| "The file could not be read.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_chosen_file_is_read_once_and_nothing_else_is() {
        let chosen = Chosen::default();
        let token = chosen.offer(PathBuf::from("/tmp/part.step"));
        assert!(chosen.take("import-99").is_none());
        assert_eq!(chosen.take(&token), Some(PathBuf::from("/tmp/part.step")));
        assert!(chosen.take(&token).is_none());
    }
}
