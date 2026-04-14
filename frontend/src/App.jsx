import React from "react";
import Map from "./components/Map";
import { ToastProvider } from "./components/Toast";

function App() {
  return (
    <ToastProvider>
      <div className="app-shell">
        <header className="app-header">
          <span className="app-logo-wrap" aria-hidden="true">
            <img src="/resources/favicon.png" alt="" className="app-logo" width="36" height="36" decoding="async" />
          </span>
          <h2 className="app-title">Rachna Map App</h2>
          <span className="app-badge">AI</span>
        </header>
        <main className="app-main">
          <Map />
        </main>
      </div>
    </ToastProvider>
  );
}

export default App;
