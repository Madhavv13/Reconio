// Starts the real app against the fake core in ./mock.ts. Used only by `npm run test:a11y`.
import { mockIPC } from "@tauri-apps/api/mocks";
import { handler } from "./mock";

mockIPC(handler);
await import("../../src/main");
