const mongoose = require('mongoose');


const testerSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true 
    },
    password: { 
        type: String, 
        required: true 
    }, 
    name: { 
        type: String, 
        required: true 
    } 
}, { 
    timestamps: true 
});

module.exports = mongoose.model('Tester', testerSchema);