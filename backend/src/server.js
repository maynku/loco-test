const express = require('express');
const dotenv = require('dotenv');
dotenv.config({ path: __dirname + '/.env' });

const redisClient = require('./config/redis');
const connectDB = require('./config/db');
const path = require('path'); //
const BusModel = require('./model/busModel2');
const Tester = require('./model/betaUser'); 

const {updateBusLocation,verifyBus,liveLocationAll} = require('./controller/busController');
//old method
// const {verifyBetaUser,createBetaUser} = require('./controller/betaUserController');

const { verifyBetaToken, createBetaUser,loginBetaUser } = require('./controller/betaUserController');
const { getBusHistory } = require('./controller/locationController');

const app = express();
const port = process.env.PORT;

app.use(express.json());
app.use(express.static('public'));

//setting websocket server
const { Server } = require("socket.io");
const http = require('http')

//http server create karne ke liye express app ko pass karenge upgrade krte hai 
const server = http.createServer(app);
const io = new Server(server);

app.post('/verify-bus',verifyBus,)
app.get('/live-location-all',verifyBetaToken,liveLocationAll);


//beta user routes 
app.get('/student',verifyBetaToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.post('/api/create-beta-user', createBetaUser);
app.post('/api/login', loginBetaUser);



//check for the line marking 
app.get('/api/bus-history/:busId',getBusHistory);


// curl.exe -X POST http://localhost:5000/api/testers `
//      -H "Content-Type: application/json" `
//      -d '{"username": "admin", "password": "TestBus@1", "name": "Admin User"}'

app.post('/api/bus/dummy-location', async (req, res) => {
    try {
        const { busId, lat, lng } = req.body;
        const timestamp = new Date();

        // 1. Redis Cache Update (5 Minute Expiry)
        await redisClient.set(
            `bus:${busId}:live`,
            JSON.stringify({ lat, lng, timestamp }),
            { EX: 300 }
        );

        // 2. MongoDB History Insert (Tera direct Mongoose Model)
        // Note: Apne Schema model ka naam check kar lena agar alag ho toh
        await BusModel.create({ busId, lat, lng, timestamp });

        console.log(`⚡ Dummy Data Updated -> Bus: ${busId} [${lat}, ${lng}]`);
        
        return res.status(200).json({ 
            success: true, 
            message: "Data updated in Redis and Mongo successfully!" 
        });

    } catch (error) {
        console.error("Error updating dummy data:", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});
//validate dummy user 



//beta testing removal documents script
//  PICHLE 30 MINUTE KA DATA DELETE KARNE KE LIYE ENDPOINT
// app.delete('/api/bus-locations/purge-thirty', async (req, res) => {
//     try {
//         //  Time zone ka panga khatam! Jo bhi test bus ID 'BUS_BETA_' se shuru hoti hai, sab saaf!
//         const result = await BusModel.deleteMany({
//             busId: { $regex: /^BUS_BETA_/ }
//         });

//         console.log(`Purge Alert: ${result.deletedCount} test documents deleted.`);

//         res.status(200).json({
//             status: "success",
//             message: "Saara test data ekdum saaf kar diya gaya hai!",
//             deletedCount: result.deletedCount
//         });
//     } catch (error) {
//         console.error("Purge Error:", error);
//         res.status(500).json({ status: "error", message: error.message });
//     }
// });

// app.get('/', (req, res) => {
//   res.send('Hello World!');
// });

async function startServer() {
  try {
    await redisClient.connect();
    console.log('Connected to Redis successfully');
    console.log('JWT Secret:', process.env.JWT_SECRET); // Debugging line to check if JWT_SECRET is loaded
    await connectDB();
    console.log('Connected to MongoDB successfully');

    server.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port} and accessible on network`);
});
 }catch (error) {
    console.error('Error connecting to Redis or Datab ase:', error);
    process.exit(1);
  }
}

startServer();


//main code working testing k liye isko bas comment kra hai beta testing k liye 
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
    });

    socket.on('updateLocation', async (data) => {
        console.log("Received Location:", data);
        // Sirf controller ko call kiya
        await updateBusLocation(data);
        //beta testing k liye callback bhej rahe hai
        
        
        // Dashboard ko update bheja
        // io.emit('live-update', data);
    });
});


//beta testing handeling
// io.on('connection', (socket) => {
//     console.log('A user connected:', socket.id);
//     socket.on('disconnect', () => {
//         console.log('A user disconnected:', socket.id);
//     });

//     //  Bas yahan brackets mein (data, callback) kiya hai taaki callback access ho sake
//     socket.on('updateLocation', async (data, callback) => {
//         console.log("Received Location:", data);
        
//         // Sirf controller ko call kiya
//         await updateBusLocation(data);
        
//         // Beta testing k liye callback bhej rahe hai (Ab crash nahi hoga)
//         if (callback && typeof callback === "function") {
//             callback({ status: "success" });
//         }
        
//         // Dashboard ko update bheja
//         // io.emit('live-update', data);
//     });
// });
