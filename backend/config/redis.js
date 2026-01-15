require('dotenv').config();
const {createClient} = require('redis');

const redis = createClient({
  password: process.env.REDIS_PASSWORD || undefined, 
  socket: {
    host: process.env.REDIS_HOST || 'http://localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
  }
});

redis.on("error", (err) => console.error("Redis error: ",err));
redis.on("connect", () => console.log("Connected to Redis"));

const connectRedis = (async () =>{
    try{
      await redis.connect();
      console.log("Redis connected successfully");  
    }catch(err){
        console.error("Redis connection failed: ", err);
        process.exit(1);
    }
});

module.exports = {
    redis,
    connectRedis
};