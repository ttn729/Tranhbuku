const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startGameTimer() {
  for (let i = 60; i >= 0; i--) {
    console.log(i);
    io.emit('set timer', 'Time: ' + i);

    await delay(1000); // Wait for 1 second
  }
}

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

let usernameMap = {}

io.on('connection', (socket) => {
  console.log('a user connected');

  socket.on('join', (username) => {
    usernameMap[socket.id] = username;
    io.emit('chat message', username + ' has entered the chat.', 'SYSTEM');
    io.emit('update users', Object.values(usernameMap));
  });
  
  socket.on('disconnect', () => {
    console.log('user ' + socket.id  + ' has disconnected');
    io.emit('chat message', usernameMap[socket.id] + ' has disconnected.', 'SYSTEM');
    delete usernameMap[socket.id];
    io.emit('update users', Object.values(usernameMap));
  });

  socket.on('chat message', (msg, username) => {
    console.log(typeof username)
    console.log('message: ' + msg + ' username: ' + username);
    io.emit('chat message', msg, username);
  });

  socket.on('start game', () => {
    console.log('start game')
    startGameTimer();
  });



});



server.listen(3000, () => {
  console.log('listening on *:3000');
});