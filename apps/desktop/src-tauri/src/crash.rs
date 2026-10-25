//! Reloads the page when its WebView2 process dies (Windows), e.g. out of memory on a large model
//! or a driver crash; otherwise the window stays white. Projects are journaled on every change, so
//! nothing is lost. The page restarts at the library with `#recovered`, so a crashing project is
//! not reopened automatically. An unresponsive page is left alone, since a long import looks the
//! same.

use tauri::WebviewWindow;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_PROCESS_FAILED_KIND, COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
};
use webview2_com::ProcessFailedEventHandler;

pub fn reload_when_page_dies(window: &WebviewWindow) {
    let page = window.clone();
    let _ = window.with_webview(move |webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else {
            return;
        };
        let mut token = 0;
        let _ = core.add_ProcessFailed(
            &ProcessFailedEventHandler::create(Box::new(move |_sender, args| {
                let Some(args) = args else {
                    return Ok(());
                };
                let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
                args.ProcessFailedKind(&mut kind)?;
                if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED {
                    if let Ok(mut url) = page.url() {
                        url.set_fragment(Some("recovered"));
                        let _ = page.navigate(url);
                    }
                }
                Ok(())
            })),
            &mut token,
        );
    });
}
