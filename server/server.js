const express = require('express');
const app = express();
const httpServer = require('http').createServer(app);
const { ApolloServer } = require('apollo-server-express');
const path = require('path');
const { authMiddleware } = require('./utils/auth');
const cors = require('cors');
// eslint-disable-next-line no-unused-vars
let onlineUsers = [];

const io = require('socket.io')(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const { typeDefs, resolvers } = require('./schemas');
const db = require('./config/connection');

const PORT = process.env.PORT || 3001;

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: authMiddleware
});

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// Create a new instance of an Apollo server with the GraphQL schema
// eslint-disable-next-line no-unused-vars
const startApolloServer = async (typeDefs, resolvers) => {
  await server.start();
  server.applyMiddleware({ app });

  db.once('open', () => {
    httpServer.listen(PORT, () => {
      console.log(`API server running on port ${PORT}!`);
      console.log(`Use GraphQL at http://localhost:${PORT}${server.graphqlPath}`);
    });
  });
};

io.on('connection', (socket) => {
  // send all active users to new user
  io.emit('get-users', onlineUsers);
  socket.emit('me', socket.id);

  // add new user
  socket.on('new-user-add', (newUserId) => {
    if (!onlineUsers.some((user) => user.userId === newUserId)) {
      // if user is not added before
      onlineUsers.push({ userId: newUserId, socketId: socket.id });
      console.log('new user is here!', onlineUsers);
    }
    // send all active users to new user
    io.emit('get-users', onlineUsers);
  });

  // end call for both users
  socket.on('endCall', ({ partnerId, userId }) => {
    io.to(partnerId).emit('callEnded');
    io.to(userId).emit('callEnded');
    console.log({ partnerId, userId }, 'end call');
  });

  socket.on('disconnect', () => {
    onlineUsers = onlineUsers.filter((user) => user.socketId !== socket.id);
    console.log('user disconnected', onlineUsers);
    // send all online users to all users
    io.emit('get-users', onlineUsers);
  });

  // socket.on('offline', () => {
  //   // remove user from active users
  //   onlineUsers = onlineUsers.filter((user) => user.socketId !== socket.id);
  //   console.log('user is offline', onlineUsers);
  //   // send all online users to all users
  //   io.emit('get-users', onlineUsers);
  // });

  socket.on('callUser', ({ userToCall, signalData, from, name }) => {
    io.to(userToCall).emit('callUser', { signal: signalData, from, name });
  });

  socket.on('answerCall', (data) => {
    io.to(data.to).emit('callAccepted', data.signal);
  });
});

// Call the async function to start the server
startApolloServer(typeDefs, resolvers);
