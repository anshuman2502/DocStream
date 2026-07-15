require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const pdfRoutes = require('./routes/pdf');
const accessRoutes = require('./routes/access');
const annotationRoutes = require('./routes/annotations');

const app = express();
const httpServer = http.createServer(app);

const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'DELETE', 'PATCH'],
  },
});

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Upload limit reached. Please try again in an hour.' },
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests. Please slow down.' },
});

app.use(generalLimiter);

app.get('/', (req, res) => {
  res.json({ message: 'DocStream API is running' });
});

app.use('/auth', authLimiter, authRoutes);
app.use('/pdf/upload', uploadLimiter);
app.use('/pdf', pdfRoutes);
app.use('/pdf', accessRoutes);
app.use('/pdf', annotationRoutes(io));

// track active users per PDF room
// structure: { pdfId: { socketId: { name, email } } }
const roomUsers = {}; // { pdfId: { userId: { id, name, email, socketId } } }

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-pdf', ({ pdfId, user }) => {
    socket.join(pdfId);
    socket.data.pdfId = pdfId;
    socket.data.user = user;

    if (!roomUsers[pdfId]) roomUsers[pdfId] = {};
    roomUsers[pdfId][user.id] = { ...user, socketId: socket.id };

    io.to(pdfId).emit('room-users', Object.values(roomUsers[pdfId]).map(({ socketId, ...u }) => u));
    console.log(`${user?.name} joined room: ${pdfId}`);
  });

  socket.on('leave-pdf', (pdfId) => {
    socket.leave(pdfId);
    const user = socket.data.user;
    if (roomUsers[pdfId] && user && roomUsers[pdfId][user.id]?.socketId === socket.id) {
      delete roomUsers[pdfId][user.id];
      io.to(pdfId).emit('room-users', Object.values(roomUsers[pdfId]).map(({ socketId, ...u }) => u));
    }
  });

  socket.on('disconnect', () => {
    const { pdfId, user } = socket.data;
    if (pdfId && user && roomUsers[pdfId] && roomUsers[pdfId][user.id]?.socketId === socket.id) {
      delete roomUsers[pdfId][user.id];
      io.to(pdfId).emit('room-users', Object.values(roomUsers[pdfId]).map(({ socketId, ...u }) => u));
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});