const jwt = require('jsonwebtoken');
const Tester = require('../model/betaUser'); // Path check kar lena bhai

// 1. LOGIN CONTROLLER (Yahan token banega)
const loginBetaUser = async (req, res) => {
    const { username, password } = req.body;

    try {
        const tester = await Tester.findOne({ username });
        
        // Agar user mila aur password sahi hai
        if (tester && tester.password === password) {
            // 🎯 Token banao jo 1 ghante mein expire ho jayega
            const token = jwt.sign(
                { id: tester._id, username: tester.username, name: tester.name },
                process.env.JWT_SECRET,
                { expiresIn: '3d' } 
            );

            return res.status(200).json({
                success: true,
                message: "Login successful!",
                token: token
            });
        }

        return res.status(401).json({ success: false, message: "Invalid username or password!" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Server error!" });
    }
};

// 2. MIDDLEWARE (Jo har route ko protect karega)
const verifyBetaToken = async (req, res, next) => {
    // Header se token nikalna (Format: Bearer <token>)
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: "Access Denied! No token provided." });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Token verify karo
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.tester = decoded; // User ka data request mein daal diya
        next(); // Agle step par bhejo
    } catch (err) {
        // 🚨 Token expire ho gaya ya galat hai
        return res.status(401).json({ success: false, message: "Token expired or invalid! Auto Logging out." });
    }
};

// Purana vala createBetaUser jo tumne likha tha
const createBetaUser = async (req, res) => {
    const { username, password, name } = req.body; 
    try {
        const newTester = new Tester({ username, password, name });
        await newTester.save();
        res.status(201).json({ message: 'Beta user created successfully!' });
    } catch (error) {
        console.error('Error creating beta user:', error);
        res.status(500).json({ message: 'Error creating beta user' });
    }
};

module.exports = { loginBetaUser, verifyBetaToken, createBetaUser };