const express = require('express');
const dotenv = require('dotenv');
dotenv.config({ path: __dirname + '/.env' });

const redisClient = require('./config/redis');
const connectDB = require('./config/db');


const {updateBusLocation} = require('./controller/busController');


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

    socket.on('bus-location', async (data) => {
        console.log("Received Location:", data);
        // Sirf controller ko call kiya
        await updateBusLocation(data);
        
        // Dashboard ko update bheja
        io.emit('live-update', data);
    });
});
