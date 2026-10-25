//! Bezier's desktop shell, for macOS, Windows and Linux.
//!
//! The application is the studio web build. This binary adds only what the
//! operating system does better: the application menu, window chrome and file
//! dialogs.

// Stops a second console window opening behind the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ask;
mod bridge;
#[cfg(windows)]
mod crash;
mod dock_icon;
mod external;
#[cfg(any(target_os = "linux", windows))]
mod film;
mod lesson;
mod memory;
mod menu;
mod open;
mod save;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::webview::PageLoadEvent;
use tauri::{Manager, WebviewWindowBuilder, WindowEvent};

fn main() {
    #[cfg(target_os = "linux")]
    linux_web_view_defaults();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(open::Chosen::default())
        .invoke_handler(tauri::generate_handler![
            ask::ask_question,
            external::open_external,
            lesson::load_lesson_state,
            lesson::open_lesson_state_file,
            memory::machine_memory,
            open::open_files,
            open::read_import,
            save::save_file
        ])
        .setup(|app| {
            menu::install(app)?;

            let window_config = app.config().app.windows.first().ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "main window config is missing",
                )
            })?;

            // Room for the Mac's window buttons comes from the studio's
            // stylesheet (`data-platform="mac"`).
            //
            // Dropped files reach the page as HTML drag events
            // (`dragDropEnabled: false` in tauri.conf.json); if Tauri takes
            // the drop, the page sees no drag at all.
            //
            // Files the app was started with are handed over once, when the
            // page first finishes loading; the page queues them until ready.
            let launched = Arc::new(bridge::launch_files());
            let handed = Arc::new(AtomicBool::new(false));
            let window = WebviewWindowBuilder::from_config(app, window_config)?
                .initialization_script(paint_hint() + &film_hint(app))
                .on_download(bridge::handle_download)
                .on_page_load(move |window, payload| {
                    bridge::sync_fullscreen(&window);
                    if matches!(payload.event(), PageLoadEvent::Finished)
                        && !handed.swap(true, Ordering::SeqCst)
                        && !launched.is_empty()
                    {
                        bridge::import_paths(window.app_handle(), &launched);
                    }
                })
                .build()?;
            #[cfg(windows)]
            crash::reload_when_page_dies(&window);
            if let Ok(theme) = window.theme() {
                dock_icon::apply(theme);
            }

            Ok(())
        })
        // Entering and leaving full screen both arrive as a resize; the
        // system going light or dark arrives as a theme change.
        .on_window_event(|window, event| match event {
            WindowEvent::Resized(_) => {
                if let Some(webview) = window.app_handle().get_webview_window(window.label()) {
                    bridge::sync_fullscreen(&webview);
                }
            }
            WindowEvent::ThemeChanged(theme) => dock_icon::apply(*theme),
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("Bezier could not start");

    app.run(|_app, _event| {
        // Finder delivers files to an already running app through this event,
        // which exists only on Apple platforms.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = _event {
            let paths = urls
                .iter()
                .filter_map(|url| url.to_file_path().ok())
                .collect::<Vec<_>>();
            bridge::import_paths(_app, &paths);
        }
    });
}

/// The intro film's URL on Linux and Windows (`film.rs`). Empty on a Mac, where the page's own
/// copy plays.
#[cfg(any(target_os = "linux", windows))]
fn film_hint(app: &tauri::App) -> String {
    use tauri::path::BaseDirectory;
    app.path()
        .resolve("film/intro.webm", BaseDirectory::Resource)
        .ok()
        .filter(|path| path.exists())
        .and_then(film::serve)
        .map(|url| format!("window.__bezierFilm = {url:?};"))
        .unwrap_or_default()
}

#[cfg(not(any(target_os = "linux", windows)))]
fn film_hint(_app: &tauri::App) -> String {
    String::new()
}

/// Tells the page when it renders without a GPU, so it skips expensive effects
/// (`glass-fallback.ts`). On Linux the page cannot tell: WebKitGTK names every renderer
/// "Apple GPU", software rendering included, and does not refuse a slow WebGL context.
fn paint_hint() -> String {
    format!("window.__bezierSoftwarePaint = {};", software_paint())
}

#[cfg(target_os = "linux")]
fn software_paint() -> bool {
    if std::env::var_os("LIBGL_ALWAYS_SOFTWARE").is_some_and(|value| value == "1") {
        return true;
    }
    // No render node means no hardware rendering for the web view: containers, and VMs without 3D
    // passthrough whose CPU flags may not say so (emulated x86 on Apple silicon has no
    // `hypervisor` flag).
    if !std::path::Path::new("/dev/dri/renderD128").exists() {
        return true;
    }
    // x86 CPUs report `hypervisor` inside a VM; ARM has no such flag, so check the vendor too.
    let flagged = std::fs::read_to_string("/proc/cpuinfo")
        .map(|info| {
            info.lines()
                .filter(|line| line.starts_with("flags"))
                .any(|line| line.split_whitespace().any(|flag| flag == "hypervisor"))
        })
        .unwrap_or(false);
    let maker = ["sys_vendor", "product_name"]
        .iter()
        .filter_map(|name| std::fs::read_to_string(format!("/sys/class/dmi/id/{name}")).ok())
        .collect::<String>()
        .to_lowercase();
    flagged
        || [
            "qemu",
            "vmware",
            "virtualbox",
            "parallels",
            "kvm",
            "bochs",
            "hyper-v",
        ]
        .iter()
        .any(|name| maker.contains(name))
}

/// WebView2 and WKWebView name their renderers, so the page can tell by itself.
#[cfg(not(target_os = "linux"))]
fn software_paint() -> bool {
    false
}

/// Disables WebKitGTK's DMA-BUF renderer unless set explicitly. It fails on many machines without
/// a GPU, VMs and some NVIDIA drivers among them (blank window or slow frames). Must be set before
/// the first web view exists.
#[cfg(target_os = "linux")]
fn linux_web_view_defaults() {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}
