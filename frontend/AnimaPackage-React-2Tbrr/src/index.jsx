import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Card } from "./screens/Card";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <Card />
  </StrictMode>,
);
