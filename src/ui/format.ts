import type { Kind } from "../ipc";

export const KIND_LABEL: Record<Kind, string> = {
  domain: "Domain",
  wildcard: "Wildcard",
  pattern: "Pattern",
  ip: "IP",
  cidr: "CIDR",
};

/** Numbers are exact and grouped (12,481). */
export const fmt = (n: number) => n.toLocaleString("en-US");

/** 2026-11-14 16:40, local time. */
export function fmtTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
