const { io } = require("socket.io-client");

// ⚙️ TESTING CONFIGURATION
const BACKEND_URL = "http://localhost:5000"; // Tera backend URL/Port
const TOTAL_BUSES = 20;     // 20 concurrent buses
const SEND_INTERVAL = 3000; // Har 3 second mein ek packet ghirega
const ACK_TIMEOUT = 2500;   // Agar 2.5 second tak backend se response nahi aaya toh Loss maana jayega

let metrics = {
    totalSent: 0,
    successfulAck: 0,
    packetLoss: 0,
    activeConnections: 0,
    staggeredDelays: []
};

// Haldwani Center Point
const BASE_LAT = 29.2183;
const BASE_LNG = 79.5123;

console.log("🚀 Starting Concurrency & Packet Loss Test...");
console.log("🟢 Handshaking with your updated backend controller...");

function startBusSimulation(busNum) {
    const busId = `BUS_BETA_${String(busNum).padStart(2, '0')}`;
    
    // ⏱️ STAGGERED CONCURRENCY (Buses text book schedule ke hisab se 0-10s ke delay me aayengi)
    const randomStartDelay = Math.random() * 10000; 
    metrics.staggeredDelays.push(randomStartDelay);

    setTimeout(() => {
        const socket = io(BACKEND_URL, {
            forceNew: true,
            reconnection: true
        });

        socket.on("connect", () => {
            metrics.activeConnections++;
            
            // 🔄 Continuous Ingestion Loop
            setInterval(() => {
                const currentLat = BASE_LAT + (Math.random() - 0.5) * 0.01;
                const currentLng = BASE_LNG + (Math.random() - 0.5) * 0.01;

                // Exact payload matching your controller
                const payload = { busId, lat: currentLat, lng: currentLng };

                metrics.totalSent++;
                let ackReceived = false;

                // ⏱️ Watchdog Timer for Packet Loss
                const timeoutId = setTimeout(() => {
                    if (!ackReceived) {
                        metrics.packetLoss++;
                    }
                }, ACK_TIMEOUT);

                // 📦 Sending packet with your newly added callback function!
                socket.emit("updateLocation", payload, (response) => {
                    ackReceived = true;
                    clearTimeout(timeoutId); // Server ka reply aa gaya, timer cancel!
                    
                    if (response && response.status === "success") {
                        metrics.successfulAck++;
                    } else {
                        metrics.packetLoss++;
                    }
                });
                
            }, SEND_INTERVAL);
        });

        socket.on("disconnect", () => {
            metrics.activeConnections--;
        });

    }, randomStartDelay);
}

// 🎬 Trigger all buses in parallel loops
for (let i = 1; i <= TOTAL_BUSES; i++) {
    startBusSimulation(i);
}

// 📊 HIGH-FIDELITY LIVE METRICS DASHBOARD
setInterval(() => {
    console.clear();
    const lossPercentage = metrics.totalSent > 0 ? ((metrics.packetLoss / metrics.totalSent) * 100).toFixed(2) : 0;

    console.log("=======================================================");
    console.log("📊 TELEMETRY & CONCURRENCY METRICS DASHBOARD");
    console.log("=======================================================");
    console.log(`🟢 Active Concurrent Sockets : ${metrics.activeConnections} / ${TOTAL_BUSES}`);
    console.log(`📤 Total Packets Triggered   : ${metrics.totalSent}`);
    console.log(`📥 Successfully Processed    : ${metrics.successfulAck}`);
    console.log(`🔴 Packet Loss Count         : ${metrics.packetLoss}  (❌ ${lossPercentage}%)`);
    console.log(`⏱️ Avg Staggered Delay       : ${(metrics.staggeredDelays.reduce((a,b)=>a+b, 0) / TOTAL_BUSES / 1000).toFixed(2)} sec`);
    console.log("=======================================================");
    console.log("💡 CRITICAL BENCHMARK INFO:");
    console.log("-> If Packet Loss % stays near 0%, AWS micro will easily handle this.");
    console.log("-> If Loss increases, MongoDB local queue limits are bottle-necking.");
    console.log("=======================================================");
}, 2000);