// Thin, typed wrappers over the Rust commands and events (PRD §9.4).
// Types in ./bindings are generated from Rust by ts-rs: `npm run test:rust` regenerates them.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Tool } from "./bindings/Tool";
import type { ToolStatus } from "./bindings/ToolStatus";
import type { ToolLinesEvent } from "./bindings/ToolLinesEvent";
import type { ToolExitEvent } from "./bindings/ToolExitEvent";
import type { AppError } from "./bindings/AppError";
import type { Engagement } from "./bindings/Engagement";
import type { ActiveEngagement } from "./bindings/ActiveEngagement";
import type { NewEngagement } from "./bindings/NewEngagement";
import type { Preview } from "./bindings/Preview";
import type { ScopeView } from "./bindings/ScopeView";
import type { ApplyResult } from "./bindings/ApplyResult";
import type { Decision } from "./bindings/Decision";
import type { Effect } from "./bindings/Effect";
import type { ImportResult } from "./bindings/ImportResult";

export type { Tool, ToolStatus, ToolLinesEvent, ToolExitEvent, AppError, Engagement, ActiveEngagement, NewEngagement };
export type { Preview, ScopeView, ApplyResult, Decision, Effect, ImportResult };
export type { ToolState } from "./bindings/ToolState";
export type { ToolLine } from "./bindings/ToolLine";
export type { Rule } from "./bindings/Rule";
export type { Kind } from "./bindings/Kind";
export type { PreviewRule } from "./bindings/PreviewRule";
export type { Hint } from "./bindings/Hint";
export type { HintAction } from "./bindings/HintAction";
export type { RunBlock } from "./bindings/RunBlock";
export type { Attestation } from "./bindings/Attestation";

/** Every command rejects with an AppError; anything else is wrapped into one. */
export function asAppError(e: unknown): AppError {
  if (e && typeof e === "object" && "code" in e && "message" in e) return e as AppError;
  return { code: "io", message: String(e) };
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw asAppError(e);
  }
}

// ---------- tools (Module 0) ----------
export const TOOLS: Tool[] = ["subfinder", "dnsx", "httpx"];
export const toolsStatus = () => call<ToolStatus[]>("tools_status");
export const toolVersionStream = (tool: Tool) => call<string>("tool_version_stream", { tool });
export const onToolLines = (cb: (e: ToolLinesEvent) => void): Promise<UnlistenFn> =>
  listen<ToolLinesEvent>("tool:lines", (e) => cb(e.payload));
export const onToolExit = (cb: (e: ToolExitEvent) => void): Promise<UnlistenFn> =>
  listen<ToolExitEvent>("tool:exit", (e) => cb(e.payload));

// ---------- engagements (ENG) ----------
export const engagementList = () => call<Engagement[]>("engagement_list");
export const engagementActive = () => call<ActiveEngagement | null>("engagement_active");
export const engagementCreate = (input: NewEngagement) => call<ActiveEngagement>("engagement_create", { input });
export const engagementOpen = (id: string) => call<ActiveEngagement>("engagement_open", { id });
export const engagementUpdate = (id: string, name: string, client: string | null, notes: string | null) =>
  call<Engagement>("engagement_update", { id, name, client, notes });
export const engagementDelete = (id: string, typedName: string) => call<void>("engagement_delete", { id, typedName });

// ---------- scope (SCOPE) ----------
export const scopeList = () => call<ScopeView>("scope_list");
/** `fresh`: preview against no saved rules (New engagement) instead of the open engagement's. */
export const scopeParsePreview = (inText: string, outText: string, fresh: boolean) =>
  call<Preview>("scope_parse_preview", { inText, outText, fresh });
export const scopeApply = (inText: string, outText: string, note: string | null, reconfirm: boolean) =>
  call<ApplyResult>("scope_apply", { inText, outText, note, reconfirm });
export const scopeDelete = (id: number) => call<void>("scope_delete", { id });
export const scopeTest = (input: string) => call<Decision>("scope_test", { input });
export const scopeImport = (text: string, fileName: string, list: Effect) =>
  call<ImportResult>("scope_import", { text, fileName, list });
