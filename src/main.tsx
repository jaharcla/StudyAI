import React from "react";
import { createRoot } from "react-dom/client";
import "@copilotkit/react-core/v2/styles.css";
import "@quickdrawjs/core/quickdraw.css";
import "./styles.css";
import "./overrides.css";
import "./schemes/immersive-real.css";
import "katex/dist/katex.min.css";
import App from "./App";
import LabShell from "./lab/LabShell";

// This branch ships the immersive workspace as the real app.
// The throwaway prototype lab stays reachable with ?lab for comparison.
const showLab = new URLSearchParams(window.location.search).has("lab");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{showLab ? <LabShell /> : <App />}</React.StrictMode>
);
