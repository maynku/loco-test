const io = require("socket.io-client");
const socket = io("http://localhost:5000"); // Server URL

let lat = 25.6; // Initial Lat
let lng = 85.1; // Initial Lng

setInterval(() => {
    // Har 3 second mein thoda location change karo
    lat += 0.001; 
    lng += 0.001;

    console.log(`Sending: ${lat}, ${lng}`);
    
    // Server ko location bhej do
    socket.emit("bus-location", { 
        busId: "BUS01", 
        lat: lat, 
        lng: lng 
    });
}, 3000);