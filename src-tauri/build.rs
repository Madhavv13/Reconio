fn main() {
    // The target triple picks this build's row in binaries/manifest.json (ONB-02).
    println!(
        "cargo:rustc-env=RECONIO_TARGET={}",
        std::env::var("TARGET").expect("cargo sets TARGET")
    );
    println!("cargo:rerun-if-changed=binaries/manifest.json");
    tauri_build::build()
}
