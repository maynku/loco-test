const express = require('express');
const dotenv = require('dotenv');
dotenv.config({ path: __dirname + '/.env' });

const redisClient = require('./config/redis');
const connectDB = require('./config/db');

const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World!');
});

async function startServer() {
  try {
    await redisClient.connect();
    console.log('Connected to Redis successfully');
    await connectDB();
    console.log('Connected to MongoDB successfully');

    app.listen(port, () => {
    console.log(`Server is running on port ${port}`);

});

  }catch (error) {
    console.error('Error connecting to Redis or Datab ase:', error);
    process.exit(1);
  }
}

startServer();
