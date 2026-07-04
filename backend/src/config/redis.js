const { createClient } = require('redis');

const redisClient = createClient({
    username: 'default',
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: 'argument-paper-wealthy-90195.db.redis.io',
        port: 13564
    }
});

module.exports = redisClient;

