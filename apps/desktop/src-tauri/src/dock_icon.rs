//! Switches the Dock icon to the light variant while the Mac is in light mode.
//!
//! The bundle carries only the dark icon (`icons/icon.icns`), which is what
//! Finder and Launchpad show. An `.icns` cannot hold a second appearance (an
//! Icon Composer document can), so the running app sets the light one itself.

#[cfg(target_os = "macos")]
const LIGHT: &[u8] = include_bytes!("../../../../docs/brand/logo/bezier-app-icon-light.png");

/// Shows the icon for `theme`. Called on the main thread at start and on every
/// appearance change.
#[cfg(target_os = "macos")]
pub fn apply(theme: tauri::Theme) {
    use objc2::{AnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    let Some(main) = MainThreadMarker::new() else {
        return;
    };
    let app = NSApplication::sharedApplication(main);
    let image = match theme {
        tauri::Theme::Light => NSImage::initWithData(NSImage::alloc(), &NSData::with_bytes(LIGHT)),
        // Nothing set: the Dock goes back to the bundle's own icon.
        _ => None,
    };
    // SAFETY: on the main thread, with an image AppKit owns or none.
    unsafe { app.setApplicationIconImage(image.as_deref()) };
}

#[cfg(not(target_os = "macos"))]
pub fn apply(_theme: tauri::Theme) {}
