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

    try {
        //For Beta testing isko off kr dena 
        const isValidBus = await bus.findOne({ busId: busId });
        
        if (!isValidBus) {
            console.log(`[Security Alert] Fake Bus ID detected: ${busId}. Dropping frame.`);
            throw new Error(`Invalid busId: ${busId}. Location update rejected.`);
            return; // Yahin se baahar, database safe!
        }

        // 1. Redis mein instant tracking ke liye live location update karo
        console.log(`Updating Redis for Bus: ${busId} -> [${lat}, ${lng}]`);
        await redisClient.set(`bus:${busId}:live`, JSON.stringify({ lat, lng, timestamp: new Date() }),{ EX: 180 }); // 5 minute expiry for live tracking
        console.log(`Redis updated for Bus: ${busId} with 5 min expiry.`);


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
            console.log(`[Race Condition Handled] Duplicate entry for Bus ${busId}. Skipping this frame.`);
        }
        console.error('Database error in updateBusLocation:', error.message);
    }
};
const liveLocationAll = async (req, res) => {
    try {
        // 1. RedisClient hamesha top par imported hona chahiye file ke
        console.log("Fetching all live bus locations from Redis...");
        const keys = await redisClient.keys('bus:*:live');
        console.log(`Found ${keys.length} active buses in Redis.`);
        if (keys.length === 0) {
            console.log("No active buses found in Redis.");
            return res.status(200).json([]); // No active buses
        }

        console.log("Keys fetched from Redis:", keys);
        // 2. Multi/Pipeline fast fetch ke liye
        const pipeline = redisClient.multi();
        keys.forEach(key => pipeline.get(key));
        const results = await pipeline.exec();
        console.log("Fetched live locations from Redis:", results);

        // 3. Array format mein data ready karna
        const allBuses = keys.map((key, index) => {
            const busId = key.split(':')[1];
            return {
                busId,
                ...JSON.parse(results[index])
            };
        });
        console.log("All live bus locations prepared for response:", allBuses);

        return res.status(200).json(allBuses);

    } catch (error) {
        console.error("Error in liveLocationAll controller:", error.message);
        return res.status(500).json({ message: "Server error fetch karne mein" });
    }
};

module.exports = { updateBusLocation, verifyBus, liveLocationAll };
