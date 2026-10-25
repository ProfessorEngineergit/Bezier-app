//! The machine's physical memory, so the page can plan large imports.
//!
//! The page cannot find out: Chromium (WebView2) caps `deviceMemory` at 8 GB and WebKit reports
//! nothing, yet some imports peak above 8 GB. Each platform's own system call is used.

/// The machine's memory in bytes, or None where the system would not say.
#[tauri::command]
pub fn machine_memory() -> Option<u64> {
    total()
}

#[cfg(windows)]
fn total() -> Option<u64> {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetPhysicallyInstalledSystemMemory(total_kilobytes: *mut u64) -> i32;
    }
    let mut kilobytes: u64 = 0;
    // SAFETY: the call writes one u64 through a pointer to a live local.
    let ok = unsafe { GetPhysicallyInstalledSystemMemory(&mut kilobytes) };
    (ok != 0 && kilobytes > 0).then(|| kilobytes * 1024)
}

#[cfg(target_os = "linux")]
fn total() -> Option<u64> {
    let info = std::fs::read_to_string("/proc/meminfo").ok()?;
    let line = info.lines().find(|line| line.starts_with("MemTotal:"))?;
    let kilobytes: u64 = line.split_whitespace().nth(1)?.parse().ok()?;
    Some(kilobytes * 1024)
}

#[cfg(target_os = "macos")]
fn total() -> Option<u64> {
    extern "C" {
        fn sysctlbyname(
            name: *const std::os::raw::c_char,
            old: *mut std::ffi::c_void,
            old_length: *mut usize,
            new: *mut std::ffi::c_void,
            new_length: usize,
        ) -> i32;
    }
    let mut bytes: u64 = 0;
    let mut length = std::mem::size_of::<u64>();
    // SAFETY: the name is a NUL-terminated literal and the result is written into a live u64 whose
    // size is passed with it.
    let status = unsafe {
        sysctlbyname(
            c"hw.memsize".as_ptr(),
            (&mut bytes as *mut u64).cast(),
            &mut length,
            std::ptr::null_mut(),
            0,
        )
    };
    (status == 0 && bytes > 0).then_some(bytes)
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
fn total() -> Option<u64> {
    None
}
