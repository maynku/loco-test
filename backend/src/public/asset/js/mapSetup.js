// 1. Map Init (Default India View)
const map = L.map('map').setView([20.5937, 78.9629], 5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

const busMarkers = {};
let isFirstLoad = true;

// 2. Fetch and Update Markers Function
async function updateLiveBuses() {
    try {
        const res = await fetch('/api/live-location-all');
        if (!res.ok) return;

        const buses = await res.json(); // Data format: [{busId, lat, lng, timestamp}]
        
        // Counter update karo
        document.getElementById('bus-count').innerText = buses.length;

        const validLocations = [];

        buses.forEach(bus => {
            const { busId, lat, lng, timestamp } = bus;

            if (lat && lng) {
                validLocations.push([lat, lng]);

                // ⏱️ Redis ka actual timestamp parse karna
                const redisTime = timestamp ? new Date(timestamp).toLocaleTimeString() : 'N/A';

                // Popup content jisme exact Redis time ja raha hai
                const popupContent = `
                    <div class="leaflet-popup-content-value">
                        <b style="font-size: 16px;">Bus ID: ${busId}</b><br>
                        <span style="color: #2ecc71; font-weight: bold;">● Status: Running</span><br>
                        <b>Lat:</b> ${lat}<br>
                        <b>Lng:</b> ${lng}<br>
                        <small style="color: #7f8c8d;">Last Seen (Server): ${redisTime}</small>
                    </div>
                `;

                if (busMarkers[busId]) {
                    // Marker position aur data update karo bina reload ke
                    busMarkers[busId].setLatLng([lat, lng]).setPopupContent(popupContent);
                } else {
                    // Naya marker default blue pin ke sath
                    busMarkers[busId] = L.marker([lat, lng]).addTo(map).bindPopup(popupContent);
                }
            }
        });

        // Smart Zoom: Sirf pehli baar screen fit karega taaki user zoom kharab na ho
        if (isFirstLoad && validLocations.length > 0) {
            const bounds = L.latLngBounds(validLocations);
            map.fitBounds(bounds, { padding: [50, 50] });
            isFirstLoad = false;
        }

    } catch (error) {
        console.error("Error updating frontend markers:", error);
    }
}

updateLiveBuses();
setInterval(updateLiveBuses, 180000);//3MIUNTE-->PILING KREGE 