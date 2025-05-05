import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementsByTagName("canvas")[0]!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
