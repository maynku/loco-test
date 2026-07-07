const API_URL = 'http://localhost:5000'; // Apne backend ka URL check kar lena bhai
let trackingInterval = null;

// 🔄 Page load hote hi session check karo
window.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('beta_token');
    if (token) {
        showMapUI();
        initMap();
        startTrackingLoop();
    }
});

// 🚀 Login handler
async function handleLogin() {
    const usernameInput = document.getElementById('username').value;
    const passwordInput = document.getElementById('password').value;
    const errorDiv = document.getElementById('error-message');

    try {
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });

        const data = await response.json();

        if (data.success) {
            localStorage.setItem('beta_token', data.token);
            showMapUI();
            initMap();
            startTrackingLoop();
        } else {
            errorDiv.innerText = data.message || "Invalid Credentials";
            errorDiv.style.display = 'block';
        }
    } catch (err) {
        console.error("Login Error:", err);
        errorDiv.innerText = "Server error, try again!";
        errorDiv.style.display = 'block';
    }
}

// UI Toggling Functions
function showMapUI() {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('map-container').style.display = 'block';
}

function handleLogout() {
    localStorage.removeItem('beta_token');
    if (trackingInterval) clearInterval(trackingInterval);
    window.location.reload();
}

// 🗺️ Tumhara Purana Leaflet Initialization logic
let map;
const busMarkers = {};
let isFirstLoad = true;

function initMap() {
    map = L.map('map').setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

// 📡 Interval trigger function
function startTrackingLoop() {
    updateLiveBuses(); // Pehli baar turant call karo
    // Tumne 3 minute ka timer lagaya hai (180000ms), test karne ke liye 5000ms (5 sec) bhi kar sakte ho
    trackingInterval = setInterval(updateLiveBuses, 180000); 
}

// 🎯 Fetch and Update Markers Function (With JWT Security)
async function updateLiveBuses() {
    const token = localStorage.getItem('beta_token');
    if (!token) return handleLogout();

    try {
        // 🔒 Header mein Bearer Token bhej rahe hain
        const res = await fetch(`${API_URL}/live-location-all`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // 🚨 AUTO LOGOUT LOGIC: Agar token expire ho gaya (Backend throws 401)
        if (res.status === 401) {
            alert("Session Expired! Please Login Again");
            handleLogout();
            return;
        }

        if (!res.ok) return;

        const buses = await res.json();
        console.log("Fetched Live Buses:", buses);
        
        document.getElementById('bus-count').innerText = buses.length;
        const validLocations = [];

        buses.forEach(bus => {
            const { busId, lat, lng, timestamp } = bus;

            if (lat && lng) {
                validLocations.push([lat, lng]);
                const redisTime = timestamp ? new Date(timestamp).toLocaleTimeString() : 'N/A';

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
                    busMarkers[busId].setLatLng([lat, lng]).setPopupContent(popupContent);
                } else {
                    busMarkers[busId] = L.marker([lat, lng]).addTo(map).bindPopup(popupContent);
                }
            }
        });

        if (isFirstLoad && validLocations.length > 0) {
            const bounds = L.latLngBounds(validLocations);
            map.fitBounds(bounds, { padding: [50, 50] });
            isFirstLoad = false;
        }

    } catch (error) {
        console.error("Error updating frontend markers:", error);
    }
}


let busPathLine = null; // Map par path track karne ke liye global instance

async function drawBusPath(busId) {
    try {
        // 🛰️ Bina kisi header ke direct open API hit karo jaisa tumne bola
        const res = await fetch(`${API_URL}/api/bus-history/${busId}`, {
            method: 'GET'
        });

        if (!res.ok) return;
        const data = await res.json();

        if (data.success && data.path && data.path.length > 0) {
            
            // 🧹 Purani line ko map se remove karo agar koi pehle se draw ho rhi hai
            if (busPathLine) {
                map.removeLayer(busPathLine);
            }

            // ✍️ Nayi line/path draw karo coordinates array se
            busPathLine = L.polyline(data.path, {
                color: '#3498db',     // Line color (Premium Blue)
                weight: 5,            // Line ki thickness
                opacity: 0.8,         // Transparency
                dashArray: '10, 10',  // Navigation style dotted line EFFECT
                lineJoin: 'round'
            }).addTo(map);

            // 🔍 Smart Zoom: Map view ko us poore route par automatic adjust karo
            const bounds = L.latLngBounds(data.path);
            map.fitBounds(bounds, { padding: [40, 40] });

            console.log(`Path generated smoothly for Bus ID: ${busId}`);
        }
    } catch (error) {
        console.error("Error drawing route line:", error);
    }
}