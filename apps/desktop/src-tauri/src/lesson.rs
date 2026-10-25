//! Bounded checkpoint transport. Document validation is shared with the browser in core.
use std::io::Read;
use tauri_plugin_dialog::DialogExt;

const LIMIT: usize = 20_000_000;

fn validate(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > LIMIT {
        return Err("Checkpoint exceeds 20 MB.".into());
    }
    let text = std::str::from_utf8(bytes).map_err(|_| "Checkpoint must be UTF-8 JSON.")?;
    let value: serde_json::Value =
        serde_json::from_str(text).map_err(|_| "Checkpoint is not valid JSON.")?;
    if !value["features"].is_array() || !value["meta"].is_object() {
        return Err("This is not a Bezier project checkpoint.".into());
    }
    Ok(text.to_owned())
}

#[tauri::command]
pub async fn load_lesson_state(url: String) -> Result<String, String> {
    let url = reqwest::Url::parse(&url).map_err(|_| "Invalid checkpoint URL.")?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return Err("Use an HTTPS URL without embedded credentials.".into());
    }
    let client = reqwest::Client::builder()
        .https_only(true)
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(3))
        .build()
        .map_err(|e| e.to_string())?;
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|_| "Checkpoint server could not be reached.")?
        .error_for_status()
        .map_err(|e| {
            format!(
                "Checkpoint download failed: {}",
                e.status().map(|s| s.as_u16()).unwrap_or(0)
            )
        })?;
    if response.content_length().unwrap_or(0) > LIMIT as u64 {
        return Err("Checkpoint exceeds 20 MB.".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Checkpoint download was interrupted.")?
    {
        if bytes.len() + chunk.len() > LIMIT {
            return Err("Checkpoint exceeds 20 MB.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    validate(&bytes)
}

#[tauri::command]
pub async fn open_lesson_state_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("Bezier project", &["bezier", "json"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = file
            .into_path()
            .map_err(|_| "The selected file is not local.")?;
        let file = std::fs::File::open(path).map_err(|_| "The checkpoint could not be opened.")?;
        let mut bytes = Vec::new();
        file.take((LIMIT + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| "The checkpoint could not be read.")?;
        validate(&bytes).map(Some)
    })
    .await
    .map_err(|_| "The file dialog could not finish.".to_string())?
}
