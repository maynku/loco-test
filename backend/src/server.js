const express = require('express');
const dotenv = require('dotenv');
dotenv.config({ path: __dirname + '/.env' });

const redisClient = require('./config/redis');
const connectDB = require('./config/db');
const path = require('path'); //
const BusModel = require('./model/busModel2');

const {updateBusLocation,verifyBus,liveLocationAll} = require('./controller/busController');


const app = express();
const port = process.env.PORT || 4000;
app.use(express.json());
app.use(express.static('public'));

//setting websocket server
const { Server } = require("socket.io");
const http = require('http')

//http server create karne ke liye express app ko pass karenge upgrade krte hai 
const server = http.createServer(app);
const io = new Server(server);

app.post('/verify-bus',verifyBus,)
app.get('/api/live-location-all',liveLocationAll);
app.get('/student', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

// app.get('/', (req, res) => {
//   res.send('Hello World!');
// });

async function startServer() {
  try {
    await redisClient.connect();
    console.log('Connected to Redis successfully');
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

// Socket.IO connection handling

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
    });

    socket.on('updateLocation', async (data) => {
        console.log("Received Location:", data);
        // Sirf controller ko call kiya
        await updateBusLocation(data);
        
        // Dashboard ko update bheja
        // io.emit('live-update', data);
    });
});
