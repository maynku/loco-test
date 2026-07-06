// models/BusLocation.js
const mongoose = require('mongoose');

const BusLocationSchema = new mongoose.Schema({
    busId: { type: String, required: true, unique: true }, // Yeh tumhari Primary Key hogi
    date: { type: String, required: true }, // Format: 'YYYY-MM-DD' (daily tracking ke liye)
    locations: [
        {
            lat: Number, //bus ek doc udk rnadr array k form uske co ordinate
            lng: Number,
            timestamp: { 
                type: Date, default: Date.now //curr date and time ko default value ke roop mein set karega
            },
        }
    ]
});

module.exports = mongoose.model('BusModel', BusLocationSchema);