import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SidePanelApp } from "./SidePanelApp";
import "../styleguide.css";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <SidePanelApp />
  </StrictMode>
);
