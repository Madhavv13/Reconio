import React from "react";
import ReactDOM from "react-dom/client";
// Fonts are bundled, never loaded from a CDN (PRD §9.5).
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/design/tokens.css";
import "./styles/design/components.css";
import "./styles/layout.css";
import App from "./App";
import { mountAnnouncer } from "./ui/a11y";

mountAnnouncer();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
