//! Windows: every tool process joins one Job Object created with KILL_ON_JOB_CLOSE.
//! Reconio never closes the handle, so the OS closes it when Reconio exits for any reason
//! (normal quit, crash, Task Manager) and ends every tool in the job (NFR-R2).

use std::ffi::c_void;
use std::sync::OnceLock;
use tokio::process::Child;
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

pub(super) struct Job(HANDLE);
// The handle is only passed to thread-safe Win32 calls.
unsafe impl Send for Job {}
unsafe impl Sync for Job {}

impl Job {
    pub(super) fn new() -> std::io::Result<Job> {
        unsafe {
            let h = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if h.is_null() {
                return Err(std::io::Error::last_os_error());
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                h,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if ok == 0 {
                let e = std::io::Error::last_os_error();
                CloseHandle(h);
                return Err(e);
            }
            Ok(Job(h))
        }
    }

    pub(super) fn add(&self, child: &Child) -> std::io::Result<()> {
        let raw = child
            .raw_handle()
            .ok_or_else(|| std::io::Error::other("process already exited"))?;
        if unsafe { AssignProcessToJobObject(self.0, raw as HANDLE) } == 0 {
            return Err(std::io::Error::last_os_error());
        }
        Ok(())
    }

    #[cfg(test)]
    pub(super) fn close(self) {
        unsafe { CloseHandle(self.0) };
    }
}

static APP_JOB: OnceLock<Job> = OnceLock::new();

pub(super) fn assign(child: &Child) -> std::io::Result<()> {
    let job = match APP_JOB.get() {
        Some(j) => j,
        None => {
            let j = Job::new()?;
            APP_JOB.get_or_init(|| j)
        }
    };
    job.add(child)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::{resolve_path, Tool};
    use std::process::Stdio;
    use std::time::Duration;

    /// dnsx waits on stdin forever. Closing the job handle must end it, which is what the OS
    /// does when Reconio dies.
    #[tokio::test]
    async fn closing_the_job_kills_the_tool() {
        let mut cmd = super::super::build_command(&resolve_path(Tool::Dnsx), &["-silent".into()]).unwrap();
        cmd.stdin(Stdio::piped()).kill_on_drop(false);
        let mut child = cmd.spawn().unwrap();
        let job = Job::new().unwrap();
        job.add(&child).unwrap();
        assert!(child.try_wait().unwrap().is_none(), "dnsx should still be waiting on stdin");
        job.close();
        let status = tokio::time::timeout(Duration::from_secs(3), child.wait()).await;
        assert!(status.is_ok(), "tool still running 3 s after the job closed");
    }
}
