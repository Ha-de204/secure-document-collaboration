require('dotenv').config();
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const {connectRedis} = require("./config/redis.js")

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users.js');
var blockRouter = require('./routes/block');
var documentRouter = require('./routes/document');

const { init } = require('./models/Block.js');
const { initSocket } = require('./sockets/socket.js');

const cors = require('cors');

var app = express();

app.use(cors({
  origin: 'http://localhost:3000', // frontend
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.options('*', cors());

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');
    } catch (error) {
        console.error('MongoDB Connection Error: ', error.message);
    }
};
connectDB();

(async () => {
  try{
    await connectRedis();
  }catch(err){
      console.error("Redis connection error: ", err);
  }
})()
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      process.env.URL_FRONTEND,
      process.env.URL_BACKEND
    ],
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,

})

initSocket(io);

// route
app.use('/api', indexRouter);
app.use('/users', usersRouter);
app.use('/blocks', blockRouter);
app.use('/documents', documentRouter);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  res.status(err.status || 500).json({
    message: err.message,
    error: req.app.get('env') === 'development' ? err : {}
  })
});
/*
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on: ${process.env.URL_BACKEND || 'http://localhost:' + PORT}`);
});
*/
module.exports = { app, server };
