import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import { useEffect, useState } from "react";

function Map() {
  const [shops, setShops] = useState([]);

  // Fetch shops
  useEffect(() => {
    fetch("http://localhost:5000/api/shops")
      .then(res => res.json())
      .then(data => setShops(data));
  }, []);

  // Add shop on click
  function AddShop() {
    useMapEvents({
      click(e) {
        const shop_name = prompt("Enter shop name");

        if (!shop_name) return;

        fetch("http://localhost:5000/api/shops/add", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            shop_name,
            latitude: e.latlng.lat,
            longitude: e.latlng.lng
          })
        }).then(() => window.location.reload());
      }
    });
    return null;
  }

  return (
    <MapContainer center={[23.0225, 72.5714]} zoom={13} style={{ height: "500px" }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      <AddShop />

      {shops.map(shop => (
        <Marker key={shop._id} position={[shop.latitude, shop.longitude]}>
          <Popup>{shop.shop_name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

export default Map;