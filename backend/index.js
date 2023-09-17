const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const fs = require('fs');

const DEFAULT_NUM_WORDS = 20;
const DEFAULT_TURN_TIME = 120;
const vocab = fs.readFileSync('vietnamese.txt', 'utf-8').toString();

class Game {
  constructor(vocab) {
    this.words = vocab.split('\n').map(line => line.trim().toLowerCase());
    this.randomWords = [];
    this.users = [];
    this.gameStarting = false;
    this.correctWords = new Set();
    this.roundNum = 0;
    this.score = 0;
    this.playerTurn = 0;
  }

  skipTurn() {
    this.playerTurn = (this.playerTurn + 1) % this.users.length;
  }

  disconnect(socket) {
    this.users.splice(this.users.indexOf(socket.id), 1); // delete socket on disconnect
  }

  reset() {
    this.playerTurn = 0;
    this.roundNum = 0;
    this.score = 0;
  }

  start(io, roomname) {
    this.correctWords.clear();
    this.gameStarting = true;
    this.roundNum += 1;

    io.to(roomname).emit('correct words', Array.from(this.correctWords))
    io.to(roomname).emit('describe words', []); // clears everyone board
    io.to(roomname).emit('update headers', this.roundNum, this.score);
    io.to(roomname).emit('toggle button', false);

    this.getWords(DEFAULT_NUM_WORDS);
    console.log(this.randomWords);
    io.to(roomGameMap[roomname].users[roomGameMap[roomname].playerTurn].id).emit('describe words', this.randomWords);
  }

  getWords(numWords) {
    console.log("We called getWords", numWords);
    this.randomWords = [];
    for (let i = 0; i < numWords; ++i) {
      this.randomWords.push(this.words[Math.floor(Math.random() * this.words.length)]);
      console.log(this.randomWords,i , numWords);
    }

  }

  processChat(msg, username, io, roomname, socket) {

    if (this.gameStarting) {
      if (this.randomWords.includes(msg.trim().toLowerCase())) {
        io.to(roomname).emit('chat message', msg, username, true, socket.id); // only send the message if it is right

        const prevLength = this.correctWords.size;
        this.correctWords.add(this.randomWords.indexOf(msg));
        const afterLength = this.correctWords.size;

        if (afterLength > prevLength) {
          socket.data.guesserPoints += 6;
          this.users[this.playerTurn].data.describerPoints += 6;
          this.score += 6

          update(roomname);
        }

        io.to(roomname).emit('correct words', Array.from(this.correctWords));
      }
      else {
        io.to(roomname).emit('chat message', msg, username, false, socket.id); // only send the message if it is right
      }
    }

  }
}

var roomGameMap = {};

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startGameTimer(roomname) {
  for (let i = DEFAULT_TURN_TIME; i >= 0; i--) {
    io.to(roomname).emit('set timer', i);

    if (i == 0) {
      roomGameMap[roomname].gameStarting = false;
      io.to(roomname).emit('toggle button', true);

      console.log(roomGameMap[roomname].randomWords);
      io.to(roomname).emit('describe words', roomGameMap[roomname].randomWords);
      io.to(roomname).emit('correct words', Array.from(roomGameMap[roomname].correctWords))

      roomGameMap[roomname].skipTurn();
      io.to(roomname).emit('player turn', roomGameMap[roomname].playerTurn);
    }
    await delay(1000); // Wait for 1 second
  }
}

function update(roomname) {
  io.to(roomname).emit('leaderboard info', roomGameMap[roomname].users.map(user => ({
    username: user.data.username,
    guesserPoints: user.data.guesserPoints,
    describerPoints: user.data.describerPoints
  })));
  io.to(roomname).emit('update headers', roomGameMap[roomname].roundNum, roomGameMap[roomname].score);
  io.to(roomname).emit('update users', roomGameMap[roomname].users.map(socket => socket.data.username));
}

app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', (socket) => {

  socket.on('request game state', () => {
    io.to(socket.data.roomname).emit('player turn', roomGameMap[socket.data.roomname].playerTurn);
    io.to(socket.data.roomname).emit('toggle button', !roomGameMap[socket.data.roomname].gameStarting);
    io.to(socket.data.roomname).emit('update headers', roomGameMap[socket.data.roomname].roundNum, roomGameMap[socket.data.roomname].score);
  });

  socket.on('reset game', () => {
    roomGameMap[socket.data.roomname].reset();
    io.to(socket.data.roomname).emit('player turn', 0);
    io.to(socket.data.roomname).emit('update headers', roomGameMap[socket.data.roomname].roundNum, roomGameMap[socket.data.roomname].score);
    io.to(socket.data.roomname).emit('describe words', []); // clears everyone board
  });


  socket.on('join', (username, roomname) => {
    socket.data.username = username;
    socket.data.guesserPoints = 0;
    socket.data.describerPoints = 0;

    socket.data.roomname = roomname;
    socket.join(roomname);

    if (!(roomname in roomGameMap)) {
      roomGameMap[roomname] = new Game(vocab)
    }

    roomGameMap[roomname].users.push(socket);
    update(roomname);
  });

  socket.on('skip turn', () => {
    roomGameMap[socket.data.roomname].skipTurn();
    io.to(socket.data.roomname).emit('player turn', roomGameMap[socket.data.roomname].playerTurn);
  })

  socket.on('disconnect', () => {
    roomGameMap[socket.data.roomname].disconnect(socket);
    update(socket.data.roomname);
  });

  socket.on('chat message', (msg, username) => {
    roomGameMap[socket.data.roomname].processChat(msg, username, io, socket.data.roomname, socket);
  });

  socket.on('start game', () => {
    roomGameMap[socket.data.roomname].start(io, socket.data.roomname);
    startGameTimer(socket.data.roomname);
  });
});

server.listen(3000, () => {
  console.log('listening on *:3000');
});
