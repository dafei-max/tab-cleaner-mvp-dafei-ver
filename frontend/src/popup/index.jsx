import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PopupApp } from "./PopupApp";
import "../styleguide.css";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>
);
