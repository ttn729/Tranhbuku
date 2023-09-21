const favicon = require('serve-favicon');
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const fs = require('fs');
const { Game } = require('./Game')

const vietnamese = fs.readFileSync('vietnamese.txt', 'utf-8').toString();
const english = fs.readFileSync('english.txt', 'utf-8').toString();

const gameInstances = {
  en: (wordsPerTurn, startingTime) => new Game(english, wordsPerTurn, startingTime),
  vi: (wordsPerTurn, startingTime) => new Game(vietnamese, wordsPerTurn, startingTime),
};

var roomGameMap = {};

function joinGame(socket, username, roomname, randomKey) {
  socket.data.username = username;
  socket.data.guesserPoints = 0;
  socket.data.describerPoints = 0;

  if (roomname in roomGameMap) {
    socket.data.roomname = roomname;
    socket.join(roomname);
    roomGameMap[roomname].users.push(socket);
    update(io, roomname);
  }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function startGameTimer(roomname) {
  for (let i = roomGameMap[roomname].startingTime; i >= 0; i--) {
    io.to(roomname).emit('set timer', i);

    if (i === 0) {
      roomGameMap[roomname].gameStarting = false;
      io.to(roomname).emit('toggle button', true);

      io.to(roomname).emit('describe words', roomGameMap[roomname].randomWords);
      io.to(roomname).emit('correct words', Array.from(roomGameMap[roomname].correctWords))
      io.to(roomname).emit('end game');
      roomGameMap[roomname].skipTurn();
      update(io, roomname);
    }
    await delay(1000); // Wait for 1 second
  }
}

function update(io, roomname) {
  io.to(roomname).emit('leaderboard info', roomGameMap[roomname].users.map(user => ({
    username: user.data.username,
    guesserPoints: user.data.guesserPoints,
    describerPoints: user.data.describerPoints,
    id: user.id,
  })), roomGameMap[roomname].getPlayerTurn());
  io.to(roomname).emit('update headers', roomGameMap[roomname].roundNum, roomGameMap[roomname].score);
}

app.use(express.static('public'));
app.use(favicon(__dirname + '/public/favicon.ico'));

// Routes
app.get('/', (req, res) => { res.sendFile(__dirname + '/public/index.html'); });
app.get('/game', (req, res) => { res.sendFile(__dirname + '/public/game.html'); });
app.get('/join', (req, res) => { res.sendFile(__dirname + '/public/join.html'); });
app.get('/create', (req, res) => { res.sendFile(__dirname + '/public/create.html'); });


io.on('connection', (socket) => {
  socket.on('request game state', () => {
    if (socket.data.roomname in roomGameMap) {
      io.to(socket.data.roomname).emit('toggle button', !roomGameMap[socket.data.roomname].gameStarting);
      update(io, socket.data.roomname);
    }
  });

  socket.on('reset game', () => {
    if (socket.data.roomname in roomGameMap) {
      roomGameMap[socket.data.roomname].reset();
      update(io, socket.data.roomname);
      io.to(socket.data.roomname).emit('describe words', []); // clears everyone board
      io.to(socket.data.roomname).emit('clear messages'); // clears everyone messages
    }
  });

  socket.on('join', (username, roomname, randomKey) => joinGame(socket, username, roomname, randomKey));
  
  socket.on('exists', roomname => io.to(socket.id).emit('exists', roomname in roomGameMap));

  socket.on('create', (roomname, language, words_per_turn, starting_time) => {
    if (roomname in roomGameMap) {
      io.to(socket.id).emit('create success', false);
    } else {
      roomGameMap[roomname] = gameInstances[language](words_per_turn, starting_time);
      io.to(socket.id).emit('create success', true);
    }
  });

  socket.on('skip turn', () => {
    roomGameMap[socket.data.roomname].skipTurn();
    update(io, socket.data.roomname);
  })

  socket.on('disconnect', () => {
    if (socket.data.roomname in roomGameMap) {
      roomGameMap[socket.data.roomname].disconnect(socket);
      update(io, socket.data.roomname);
    }
  });

  socket.on('chat message', (msg) => {
    const g = roomGameMap[socket.data.roomname];
    const roomname = socket.data.roomname;
    
    if (g.gameStarting) {
      const isCorrect = g.randomWords.includes(msg.trim().toLowerCase());
      io.to(roomname).emit('chat message', msg, socket.data.username, isCorrect, socket.id); // only send the message if it is right

      if (isCorrect) {
        const prevLength = g.correctWords.size;
        g.correctWords.add(g.randomWords.indexOf(msg.trim().toLowerCase()));
        const afterLength = g.correctWords.size;

        if (afterLength > prevLength) {
          socket.data.guesserPoints += 6;
          g.users[g.playerTurn].data.describerPoints += 6;
          g.score += 6

          update(io, roomname);
        }
        io.to(roomname).emit('correct words', Array.from(g.correctWords));
      }
    }
  });

  socket.on('start game', () => {
    if (socket.data.roomname in roomGameMap) {
      const roomname = socket.data.roomname;
      const g = roomGameMap[roomname];

      roomGameMap[socket.data.roomname].start();
      io.to(roomname).emit('correct words', Array.from(g.correctWords))
      io.to(roomname).emit('describe words', []); // clears everyone board
      io.to(roomname).emit('update headers', g.roundNum, g.score);
      io.to(roomname).emit('toggle button', false);
      io.to(g.users[g.playerTurn].id).emit('describe words', g.randomWords);
      io.to(socket.data.roomname).emit('clear messages'); // clears everyone messages
      startGameTimer(socket.data.roomname);
    }
  });
});

server.listen(3000, () => console.log('listening on *:3000'));