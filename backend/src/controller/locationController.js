const busModel=require('../model/busModel2');
const getBusHistory = async (req, res) => {
    const { busId } = req.params;

    try {
        // 🕒 1. TIME CALCULATION (Aaj ka din + Pichle 2 ghante)
        const now = new Date();
        
        // Aaj ki shuruat (Today's Midnight 00:00:00)
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        // Pichle 2 ghante pehle ka samay
        const twoHoursAgo = new Date(now.getTime() - (2 * 60 * 60 * 1000));

        // Jo latest time boundary hogi, wahan se filter shuru hoga
        const startTimeLimit = twoHoursAgo > startOfToday ? twoHoursAgo : startOfToday;

        console.log(`Fetching history documents for ${busId} from: ${startTimeLimit.toISOString()}`);

        // 🎯 2. ACTUAL DATABASE FETCH (Bina Array Wali Query)
        // Tumhare schema ke hisab se hum saare documents dhoondenge jo criteria match karein
        // Aur '.sort({ timestamp: 1 })' se rasta ekdum sahi sequence (purane se naye) mein milega
        const historyRecords = await busModel.find({
            busId: busId,
            timestamp: { $gte: startTimeLimit }
        }).sort({ timestamp: 1 }); // 1 matlab ascending order (chronological path)

        // ❌ Check: Agar database mein is time period ka koi data hi nahi mila
        if (!historyRecords || historyRecords.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: ` Bus ID (${busId}) there is no tracking data available for the last 2 hours or today.` 
            });
        }

        // 🧹 3. DATA FORMATTING FOR LEAFLET MAP
        // Leaflet ko chahiye array of arrays: [[lat, lng], [lat, lng]]
        const finalPath = historyRecords.map(record => [
            parseFloat(record.lat), 
            parseFloat(record.lng)
        ]);

        // 🚀 4. FINAL RESPONSE
        return res.status(200).json({
            success: true,
            busId: busId,
            totalPoints: finalPath.length,
            path: finalPath // Ekdum mast path ready hai frontend ke liye
        });

    } catch (err) {
        console.error("Error fetching filtered bus history:", err);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = { getBusHistory };

// controller/locationController.js (Ya jahan tumhare location ke routes hain)

// const getBusHistory = async (req, res) => {
//     const { busId } = req.params;

//     try {
//         const busData = await busModel.findOne({ busId: busId });
//         if (!busData) {
//             return res.status(404).json({ success: false, message: "Bus ID not found!" });
//         }
        
//         // 🎯 YAHAN REDIS YA MONGOOSE SE US BUS KE SAARE COORDINATES NIKALO
//         // Maan lete hain hume ek array milta hai jisme latest se lekar purane coordinates hain
//         // Example structure jo return karna hai:
//         const sampleHistory = [
//             [29.0021, 79.5215], // Haldwani Point 1
//             [29.0055, 79.5240], // Point 2
//             [29.0110, 79.5310], // Point 3
//             [29.0185, 79.5385]  // GEHU Haldwani Campus
//         ];

//         // Tumhare actual logic ke hisab se database/Redis fetch yahan aayega:
//         // const historyData = await Redis.lrange(`history:${busId}`, 0, -1); 
        
//         return res.status(200).json({
//             success: true,
//             busId: busId,
//             path: sampleHistory // Coordinates ka array
//         });

//     } catch (err) {
//         console.error("Error fetching bus history:", err);
//         return res.status(500).json({ success: false, message: "Server Error" });
//     }
// };

// module.exports = { getBusHistory};