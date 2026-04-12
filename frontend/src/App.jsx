import React from "react";
import Map from "./components/Map";
import { ToastProvider } from "./components/Toast";

function App() {
  return (
    <ToastProvider>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        <header className="app-header">
          <img src="/resources/favicon.png" alt="Logo" className="app-logo" />
          <h2 className="app-title">Rachna Map App</h2>
          <span className="app-badge">AI</span>
        </header>
        <div style={{ flex: 1 }}>
          <Map />
        </div>
      </div>
    </ToastProvider>
  );
}

export default App;
