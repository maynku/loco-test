const BusModel = require('../model/busModel');
const redisClient = require('../config/redis');

const updateBusLocation = async (data) => {
    const { busId, lat, lng } = data;
    const today = new Date().toISOString().split('T')[0];

    // Redis aur MongoDB ka logic yahan hoga
    await redisClient.set(`bus:${busId}:live`, JSON.stringify({ lat, lng, timestamp: new Date() }));

   // Key (Address)	Value (Data)
//bus:BUS01:live	"{ "lat": 25.6, "lng": 85.1 }"
//bus:BUS02:live	"{ "lat": 24.1, "lng": 84.9 }"
    
    await BusModel.findOneAndUpdate(
        { busId, date: today },
        { $push: { locations: { lat, lng, timestamp: new Date() } } },
        { upsert: true }
    );
};

module.exports = { updateBusLocation };