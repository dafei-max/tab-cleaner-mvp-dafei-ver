import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PersonalSpace } from "../screens/PersonalSpace";
import "../index.css";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <PersonalSpace />
  </StrictMode>,
);





