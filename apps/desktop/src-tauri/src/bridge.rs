//! Bridge from native menu commands and file events to the studio.
//!
//! Native actions are translated into the same DOM events as their keyboard or
//! title-bar equivalents, so each action has one implementation.

use std::path::{Path, PathBuf};

use tauri::{webview::DownloadEvent, AppHandle, Manager, Webview, WebviewWindow};

use crate::open::{display_name, Chosen};

/// Routes a native menu command into the studio.
pub fn run_command(window: &WebviewWindow, command: &str) {
    // A studio action by name (`action:view-top`), dispatched directly so a
    // remapped key does not change what the menu does.
    if let Some(action) = command.strip_prefix("action:") {
        let safe = action.replace(['\\', '\''], "");
        let _ = window.eval(format!(
            "window.dispatchEvent(new CustomEvent('bezier:action', {{ detail: '{safe}' }}));"
        ));
        return;
    }
    let script = match command {
        "preferences" => key_script(",", false),
        "undo" => key_script("z", false),
        "redo" => key_script("z", true),
        "select-all" => key_script("a", false),
        "duplicate" => key_script("d", false),
        "deselect" => key_script(".", false),
        "projects" => r#"document.querySelector('[aria-label="Projects"]')?.click();"#.to_owned(),
        "export-step" => export_script("STEP"),
        "export-stl" => export_script("STL"),
        // The studio opens the panel itself through `open_files`, off the main
        // thread; opening it here in the menu handler hangs the app.
        // Only the start page listens for `bezier:new-project`.
        "new-project" => "window.dispatchEvent(new CustomEvent('bezier:new-project'));".to_owned(),
        "import-geometry" => "window.dispatchEvent(new CustomEvent('bezier:import'));".to_owned(),
        _ => return,
    };
    let _ = window.eval(script);
}

/// Tells the page whether the window is full screen. A full-screen Mac window
/// has no traffic lights, so the title bar drops the space it leaves for them.
pub fn sync_fullscreen(window: &WebviewWindow) {
    let full = window.is_fullscreen().unwrap_or(false);
    let _ = window.eval(format!(
        "document.documentElement.toggleAttribute('data-fullscreen', {full});"
    ));
}

/// Forwards files opened from Finder (dropped on the Dock icon, or "Open With").
///
/// The page gets only a name and a token and reads the raw bytes through
/// `read_import`, so no file is embedded in a script as base64.
pub fn import_paths(app: &AppHandle, paths: &[PathBuf]) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let chosen = app.state::<Chosen>();

    for path in paths {
        if !is_geometry(path) {
            continue;
        }
        let name = display_name(path);
        let token = chosen.offer(path.clone());
        let _ = window.eval(file_open_script(&name, &token));
    }
}

/// Lets webview downloads through to the default destination, never opening a panel.
///
/// This handler runs on the UI thread, where a modal save panel deadlocks the
/// app. The studio saves through the `save_file` command; only stray downloads
/// arrive here.
pub fn handle_download(_webview: Webview, _event: DownloadEvent<'_>) -> bool {
    true
}

fn key_script(key: &str, shift: bool) -> String {
    format!(
        "window.dispatchEvent(new KeyboardEvent('keydown', {{ key: '{key}', metaKey: true, shiftKey: {shift}, bubbles: true }}));"
    )
}

fn export_script(format: &str) -> String {
    format!(
        r#"
(() => {{
  document.querySelector('.titlebar__export')?.click();
  window.setTimeout(() => {{
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((candidate) =>
      candidate.querySelector('.menu__itemLabel')?.textContent?.trim() === '{format}'
    );
    item?.click();
  }}, 0);
}})();
"#
    )
}

fn file_open_script(name: &str, token: &str) -> String {
    let safe_name = name.replace('\\', "\\\\").replace('\'', "\\'");
    // Calls the studio's import entry directly, since not every webview accepts a
    // synthetic DragEvent with a DataTransfer. Files that arrive before the page
    // has set up the entry wait in `__bezierPending`.
    format!(
        "(window.__bezierImport ?? ((name, token) => (window.__bezierPending ||= []).push([name, token])))('{safe_name}', '{token}');"
    )
}

/// Geometry files passed on the command line, as Windows and Linux do for
/// "Open with". On a Mac they arrive as `RunEvent::Opened` instead.
pub fn launch_files() -> Vec<PathBuf> {
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .filter(|path| path.is_file() && is_geometry(path))
        .collect()
}

fn is_geometry(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(crate::open::importable)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn geometry_extensions_are_case_insensitive() {
        assert!(is_geometry(Path::new("part.STEP")));
        assert!(is_geometry(Path::new("part.stp")));
        assert!(is_geometry(Path::new("part.stl")));
        assert!(is_geometry(Path::new("scan.OBJ")));
        assert!(is_geometry(Path::new("plate.dxf")));
        assert!(is_geometry(Path::new("logo.svg")));
        assert!(is_geometry(Path::new("photo.JPG")));
        assert!(is_geometry(Path::new("scan.tiff")));
        assert!(is_geometry(Path::new("shot.heic")));
        assert!(!is_geometry(Path::new("notes.txt")));
    }

    #[test]
    fn opened_file_names_cannot_break_out_of_the_script() {
        let script = file_open_script("it's a part.step", "import-3");
        assert_eq!(
            script,
            "(window.__bezierImport ?? ((name, token) => (window.__bezierPending ||= []).push([name, token])))('it\\'s a part.step', 'import-3');"
        );
    }

    #[test]
    fn exported_format_is_selected_by_visible_label() {
        let script = export_script("STEP");
        assert!(script.contains(".titlebar__export"));
        assert!(script.contains("=== 'STEP'"));
    }
}
