//! Bezier's native macOS menu bar.
//!
//! Custom editing commands dispatch to the studio rather than duplicating
//! document state in Rust. Text editing keeps macOS' predefined Cut, Copy and
//! Paste responders so inputs behave like native controls.

use tauri::{
    menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    App, Manager, Wry,
};

use crate::bridge;

pub fn install(app: &mut App<Wry>) -> tauri::Result<()> {
    let preferences = item(app, "preferences", "Settings…", "CmdOrCtrl+Comma")?;
    let undo = item(app, "undo", "Undo", "CmdOrCtrl+Z")?;
    let redo = item(app, "redo", "Redo", "CmdOrCtrl+Shift+Z")?;
    let duplicate = item(app, "duplicate", "Duplicate", "CmdOrCtrl+D")?;
    let select_all = item(app, "select-all", "Select All", "CmdOrCtrl+A")?;
    let deselect = item(app, "deselect", "Deselect", "CmdOrCtrl+Period")?;
    let new_project = item(app, "new-project", "New Project", "CmdOrCtrl+N")?;
    let import = item(app, "import-geometry", "Import Geometry…", "CmdOrCtrl+O")?;
    let export_step = item(app, "export-step", "STEP…", "CmdOrCtrl+Shift+S")?;
    let export_stl = MenuItemBuilder::with_id("export-stl", "STL…").build(app)?;
    let projects = item(app, "projects", "Projects", "CmdOrCtrl+Shift+O")?;
    // Camera views, numbered as in tablet CAD apps. They live in the menu because on macOS a
    // Command-digit that no menu item claims never reaches the webview.
    let views = [
        ("action:view-reset", "Home View", "CmdOrCtrl+1"),
        ("action:view-front", "Front", "CmdOrCtrl+2"),
        ("action:view-back", "Back", "CmdOrCtrl+3"),
        ("action:view-top", "Top", "CmdOrCtrl+4"),
        ("action:view-bottom", "Bottom", "CmdOrCtrl+5"),
        ("action:view-right", "Right", "CmdOrCtrl+6"),
        ("action:view-left", "Left", "CmdOrCtrl+7"),
    ]
    .into_iter()
    .map(|(id, label, key)| item(app, id, label, key))
    .collect::<tauri::Result<Vec<_>>>()?;

    let about = AboutMetadataBuilder::new()
        .name(Some("Bezier"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .comments(Some("Local-first parametric CAD"))
        .build();

    let app_menu = SubmenuBuilder::new(app, "Bezier")
        .about(Some(about))
        .separator()
        .item(&preferences)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let export = SubmenuBuilder::new(app, "Export")
        .item(&export_step)
        .item(&export_stl)
        .build()?;
    let file = SubmenuBuilder::new(app, "File")
        .item(&new_project)
        .item(&import)
        .item(&export)
        .separator()
        .close_window()
        .build()?;
    let edit = SubmenuBuilder::new(app, "Edit")
        .item(&undo)
        .item(&redo)
        .separator()
        .cut()
        .copy()
        .paste()
        .separator()
        .item(&duplicate)
        .item(&select_all)
        .item(&deselect)
        .build()?;
    let mut view = SubmenuBuilder::new(app, "View").item(&projects).separator();
    for entry in &views {
        view = view.item(entry);
    }
    let view = view.separator().fullscreen().build()?;
    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize_with_text("Zoom")
        .separator()
        .bring_all_to_front()
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &file, &edit, &view, &window])
        .build()?;
    app.set_menu(menu)?;

    app.on_menu_event(|app, event| {
        let id = event.id().0.as_str();
        if let Some(window) = app.get_webview_window("main") {
            bridge::run_command(&window, id);
        }
    });

    Ok(())
}

fn item(
    app: &App<Wry>,
    id: &str,
    label: &str,
    accelerator: &str,
) -> tauri::Result<tauri::menu::MenuItem<Wry>> {
    MenuItemBuilder::with_id(id, label)
        .accelerator(accelerator)
        .build(app)
}
