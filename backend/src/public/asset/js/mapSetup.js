//const API_URL = 'http://localhost:5000'; //if local run
const API_URL = ''; //auto seerver url fetch kr lega
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

// 🗺️ Leaflet Initialization
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
    updateLiveBuses(); 
    trackingInterval = setInterval(updateLiveBuses, 20000); // 20 seconds
}

// 🎯 Fetch and Update Markers Function
async function updateLiveBuses() {
    const token = localStorage.getItem('beta_token');
    if (!token) return handleLogout();

    try {
        const res = await fetch(`${API_URL}/live-location-all`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

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

// =========================================================================
// 🚀 NEW FEATURE: PATH LINE GENERATION & ERROR-PROOF UI SEARCH
// =========================================================================

let busPathLine = null; // Map par purani polyline track karne ke liye variable

// 📡 1. Main function jo backend se data laakar line plot karega (Error Handling ke sath)
async function drawBusPath(busId) {
    try {
        console.log(`Fetching history data for Bus ID: ${busId}`);
        
        // Open API hit karo bina kisi header ya token ke
        const res = await fetch(`${API_URL}/api/bus-history/${busId}`, {
            method: 'GET'
        });

        // ❌ Check 1: Agar server par route hi nahi mila ya server down hai (404, 500, etc.)
        if (!res.ok) {
            if (res.status === 404) {
                alert(`⚠️  Bus ID "${busId}" Not Exsist!`);
            } else {
                alert("⚠️ Server error! Try After Sometime.");
            }
            return;
        }
        
        const data = await res.json();

        // ❌ Check 2: Agar response aa gaya par success false hai ya path list khali hai
        if (data.success && data.path && data.path.length > 0) {
            
            // 🧹 Agar map par pehle se koi purani line bani hai, toh use mitao
            if (busPathLine) {
                map.removeLayer(busPathLine);
            }

            // ✍️ Nayi dashed line draw karo coordinates array se
            busPathLine = L.polyline(data.path, {
                color: '#3498db',     // Premium Blue color
                weight: 5,            // Line ki motai
                opacity: 0.8,         // Transparency
                dashArray: '10, 10',  // Dotted route effect
                lineJoin: 'round'
            }).addTo(map);

            // 🔍 Smart Zoom: Map view ko automatic us poore route par set karo
            const bounds = L.latLngBounds(data.path);
            map.fitBounds(bounds, { padding: [40, 40] });

            console.log(`Line plotted successfully for Bus: ${busId}`);
        } else {
            // ❌ Check 3: Agar bus ka naam sahi hai par uska koi tracking data available nahi hai
            alert(`ℹ️ Notice: Bus "${busId}" toh mili par uska koi rasta (path history) recorded nahi hai!`);
        }
    } catch (error) {
        // ❌ Check 4: Agar internet band hai ya fetch crash ho gaya
        console.error("Error drawing route line:", error);
        alert("⚠️ Network Error: Server se connect nahi ho paa rahe hain!");
    }
}

// 🖱️ 2. UI Button handler jo click hote hi chalega
function handleBusSearchClick() {
    const busIdInput = document.getElementById('search-bus-id').value.trim();
    
    // ❌ Check 5: Agar user ne bina kuch type kiye hi button daba diya
    if (!busIdInput) {
        alert("Bhai pehle Bus ID toh daalo!");
        return;
    }
    
    // Core function ko trigger karo input wali ID ke sath
    drawBusPath(busIdInput);
}