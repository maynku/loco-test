const mongoose = require('mongoose');

const busSchema = new mongoose.Schema({
    busId: { 
        type: String, 
        required: true 
    },
    lat: { 
        type: Number, 
        required: true 
    },
    lng: { 
        type: Number, 
        required: true 
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

// History query fast karne ke liye compound index (Issue #13 fix)
busSchema.index({ busId: 1, timestamp: 1 });

// TTL index — 7 din baad rows automatically delete (storage bomb defuse, Issue #13 fix)
busSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

//curl -X POST http://localhost:5000/api/bus/dummy-location -H "Content-Type: application/json" -d "{\"busId\":\"TESTBUS1\",\"lat\":29.1357,\"lng\":79.5890}"
//{"success":true,"message":"Data updated in Redis and Mongo successfully!"}
module.exports = mongoose.model('Bus', busSchema);