//! A native message dialog.
//!
//! Used for questions about work still running (leaving a project while a model loads), so the
//! dialog stays on screen even while the page is busy.

use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

/// True when the first button was pressed.
#[tauri::command]
pub async fn ask_question(
    app: tauri::AppHandle,
    title: String,
    message: String,
    yes: String,
    no: String,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(message)
            .title(title)
            .buttons(MessageDialogButtons::OkCancelCustom(yes, no))
            .blocking_show()
    })
    .await
    .map_err(|_| "The question could not be asked.".to_string())
}
