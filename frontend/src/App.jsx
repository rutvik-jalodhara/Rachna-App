import React from "react";
import Map from "./components/Map";

function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <header style={{ height: "75px", display: "flex", alignItems: "center", justifyContent: "center", gap: "16px", background: "white", boxShadow: "0 2px 5px rgba(0,0,0,0.05)", zIndex: 10 }}>
        <img src="/resources/favicon.png" alt="Logo" style={{ width: "52px", height: "52px", objectFit: "contain" }} />
        <h2 style={{ margin: 0, color: "#1a1a2e", fontSize: "1.8rem", fontWeight: "700" }}>Rachna Map App</h2>
      </header>
      <div style={{ flex: 1 }}>
        <Map />
      </div>
    </div>
  );
}

export default App;
