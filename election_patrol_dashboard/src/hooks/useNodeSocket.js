import { useEffect } from "react";
import { useDashboardStore } from "../store/dashboardStore";

export function useNodeSocket() {
  const initSocket = useDashboardStore((s) => s.initSocket);
  const emitDispatch = useDashboardStore((s) => s.emitDispatch);

  useEffect(() => {
    initSocket();
  }, [initSocket]);

  return { emitDispatch };
}
