// models/BusLocation.js
const mongoose = require('mongoose');

const BusLocationSchema = new mongoose.Schema({
    busId: { type: String, required: true, unique: true }, // Yeh tumhari Primary Key hogi
    date: { type: String, required: true }, // Format: 'YYYY-MM-DD' (daily tracking ke liye)
    locations: [
        {
            lat: Number,
            lng: Number,
            timestamp: { type: Date, default: Date.now }
        }
    ]
});

module.exports = mongoose.model('BusModel', BusLocationSchema);