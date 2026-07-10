// const BusModel = require('../model/busModel');
const redisClient = require('../config/redis');
const bus = require('../model/busModel2');

// const updateBusLocation = async (data) => {
//     const { busId, lat, lng } = data;
//     const today = new Date().toISOString().split('T')[0];

//     try {
//         // Redis mein live location daal rahe ho (Ye ekdum mast chalega fast aur bina crash ke)
//         await redisClient.set(`bus:${busId}:live`, JSON.stringify({ lat, lng, timestamp: new Date() }));

//         // Key (Address)	Value (Data)
// //bus:BUS01:live	"{ "lat": 25.6, "lng": 85.1 }"
// //bus:BUS02:live	"{ "lat": 24.1, "lng": 84.9 }"
        
//         // MongoDB logic with strict error bypass
//         await BusModel.findOneAndUpdate(
//             { busId, date: today },
//             { $push: { locations: { lat, lng, timestamp: new Date() } } },
//             { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true } 
//         );
//     } catch (error) {
//         // Agar duplicate key error (11000) aaye, toh use catch karo, server crash mat hone do
//         if (error.code === 11000) {
//             console.log(`[Race Condition Handled] Bus ${busId} updating too fast, skipping this frame.`);
//         } else {
//             console.error('Database error in updateBusLocation:', error.message);
//         }
//     }
// };

const verifyBus = async (req, res) => {
    try {
        console.log("Verifying Bus ID:", req.body.busId);
        const { busId } = req.body; 
        const FoundBus = await bus.findOne({ busId });
        console.log("Bus Found:", FoundBus);
        if (FoundBus) {
           return res.status(200).json({ success: true, message: "Bus ID verified!" });
        } else {
           return res.status(404).json({ success: false, message: "Bus ID not found!" });
        }
    } catch (error) {
        console.error('Error verifying bus:', error);
        return res.status(500).json({ message: 'Error verifying bus' });
    }
}   





const updateBusLocation = async (data) => {
    const { busId, lat, lng } = data;

    // ── Valid-ID cache (Fallback #7): pehle Redis SET dekho, warna Mongo (lazy) ──
    // Har location update pe Mongo findOne mat maaro. Valid bus IDs Redis SET
    // 'valid_bus_ids' mein cache karo — agli baar us bus ke liye DB hit nahi hoga.
    let isValidBus = await redisClient.sIsMember('valid_bus_ids', busId);
    if (!isValidBus) {
        //For Beta testing isko off kr dena
        const found = await bus.findOne({ busId: busId });
        if (found) {
            await redisClient.sAdd('valid_bus_ids', busId); // cache kar do future ke liye
            isValidBus = true;
        }
    }

    if (!isValidBus) {
        console.log(`[Security Alert] Fake Bus ID detected: ${busId}. Dropping frame.`);
        throw new Error(`Invalid busId: ${busId}. Location update rejected.`);
    }

    try {
        // 1. Redis mein instant tracking ke liye live location update karo
        console.log(`Updating Redis for Bus: ${busId} -> [${lat}, ${lng}]`);
        await redisClient.set(`bus:${busId}:live`, JSON.stringify({ lat, lng, timestamp: new Date() }),{ EX: 80 }); // 80 second ka ttl minute expiry for live tracking
        // CHAUTHA approach: active bus IDs ko ek SET mein rakho taaki read pe
        // KEYS (blocking) ki jagah SMEMBERS + MGET use kar sakein.
        await redisClient.sAdd('active_bus_ids', busId);
        console.log(`Redis updated for Bus: ${busId} with 80 second expiry.`);


        console.log(`Saving to MongoDB for Bus: ${busId} -> [${lat}, ${lng}]`);
        // 2. MongoDB mein flat row create karo (No upsert = No race condition)
        await bus.create({
            busId,
            lat,
            lng,
            timestamp: new Date()
        });

        console.log(`[Success] Location saved in DB for verified bus: ${busId}`);

    } catch (error) {
        if(error.code === 11000) {
            // Duplicate harmless hai — ise success maano, error mat throw karo
            console.log(`[Race Condition Handled] Duplicate entry for Bus ${busId}. Skipping this frame.`);
            return;
        }
        console.error('Database error in updateBusLocation:', error.message);
        throw error; // Issue #5 fix: error upar bhejo taaki driver ko ack se pata chale
    }
};
const liveLocationAll = async (req, res) => {
    try {
        // 1. RedisClient hamesha top par imported hona chahiye file ke
        console.log("Fetching all live bus locations from Redis...");
        // CHAUTHA approach: KEYS (blocking, O(N)) ki jagah SET se active bus IDs lo
        const busIds = await redisClient.sMembers('active_bus_ids');
        console.log(`Found ${busIds.length} active buses in Redis SET.`);
        if (busIds.length === 0) {
            console.log("No active buses found in Redis.");
            return res.status(200).json([]); // No active buses
        }

        // 2. Ek MGET se sabka live data (51 ops → 2 ops)
        const keys = busIds.map(id => `bus:${id}:live`);
        const results = await redisClient.mGet(keys);
        console.log("Fetched live locations from Redis (MGET):", results);

        // 3. Array format mein data ready karna + zombie IDs saaf karna
        const allBuses = [];
        const staleIds = [];
        busIds.forEach((busId, index) => {
            const raw = results[index];
            if (!raw) {
                // Live key TTL (EX:80) se expire ho gayi = bus band. SET se bhi hatao.
                staleIds.push(busId);
                return;
            }
            try {
                allBuses.push({ busId, ...JSON.parse(raw) });
            } catch (parseErr) {
                // Corrupt data — is bus ko skip karo aur SET se hatao
                staleIds.push(busId);
            }
        });

        // Zombie bus IDs SET se saaf (tumhaare TTL cleanup ko complement karta hai)
        if (staleIds.length) {
            await redisClient.sRem('active_bus_ids', staleIds);
        }

        console.log("All live bus locations prepared for response:", allBuses);
        return res.status(200).json(allBuses);

    } catch (error) {
        console.error("Error in liveLocationAll controller:", error.message);
        return res.status(500).json({ message: "Server error fetch karne mein" });
    }
};

module.exports = { updateBusLocation, verifyBus, liveLocationAll };
