"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { OVERVIEW_POLL_MS } from "./constants";

export function LiveRefresh({ intervalMs = OVERVIEW_POLL_MS }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
