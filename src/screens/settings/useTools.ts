import { useCallback, useEffect, useState } from "react";
import { toolsStatus, type ToolStatus } from "../../ipc";

/** The tool check (ONB-02): runs on mount and on `recheck`. */
export function useTools() {
  const [status, setStatus] = useState<ToolStatus[] | null>(null);
  const [checking, setChecking] = useState(false);

  const recheck = useCallback(async () => {
    setChecking(true);
    try {
      setStatus(await toolsStatus());
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    recheck();
  }, [recheck]);

  const failed = status?.filter((s) => s.state !== "ok") ?? [];
  return { status, checking, recheck, failed, allOk: !!status && failed.length === 0 };
}
