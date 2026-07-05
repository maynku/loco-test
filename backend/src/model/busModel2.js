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

//curl -X POST http://localhost:5000/api/bus/dummy-location -H "Content-Type: application/json" -d "{\"busId\":\"TESTBUS1\",\"lat\":29.1357,\"lng\":79.5890}"
//{"success":true,"message":"Data updated in Redis and Mongo successfully!"}
module.exports = mongoose.model('Bus', busSchema);