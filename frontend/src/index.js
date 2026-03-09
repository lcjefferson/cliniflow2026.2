import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Evita o erro "ResizeObserver loop completed with undelivered notifications" (benigno)
const OriginalResizeObserver = window.ResizeObserver;
if (OriginalResizeObserver) {
  window.ResizeObserver = class extends OriginalResizeObserver {
    constructor(callback) {
      super((entries, observer) => {
        window.requestAnimationFrame(() => callback(entries, observer));
      });
    }
  };
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
