// Thin, typed wrappers over the Rust commands and events (PRD §9.4).
// Types in ./bindings are generated from Rust by ts-rs: `cd src-tauri && cargo test export_bindings`.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Tool } from "./bindings/Tool";
import type { ToolStatus } from "./bindings/ToolStatus";
import type { ToolLinesEvent } from "./bindings/ToolLinesEvent";
import type { ToolExitEvent } from "./bindings/ToolExitEvent";

export type { Tool, ToolStatus, ToolLinesEvent, ToolExitEvent };
export type { ToolState } from "./bindings/ToolState";
export type { ToolLine } from "./bindings/ToolLine";

export const TOOLS: Tool[] = ["subfinder", "dnsx", "httpx"];

export const toolsStatus = () => invoke<ToolStatus[]>("tools_status");
export const toolVersionStream = (tool: Tool) => invoke<string>("tool_version_stream", { tool });

export const onToolLines = (cb: (e: ToolLinesEvent) => void): Promise<UnlistenFn> =>
  listen<ToolLinesEvent>("tool:lines", (e) => cb(e.payload));
export const onToolExit = (cb: (e: ToolExitEvent) => void): Promise<UnlistenFn> =>
  listen<ToolExitEvent>("tool:exit", (e) => cb(e.payload));
