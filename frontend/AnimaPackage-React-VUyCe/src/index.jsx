import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PetSetting } from "./screens/PetSetting";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <PetSetting />
  </StrictMode>,
);
