const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const fs = require('fs');

const DEFAULT_NUM_WORDS = 20;
const DEFAULT_TURN_TIME = 10;

const vietnamese = fs.readFileSync('vietnamese.txt', 'utf-8').toString();
const english = fs.readFileSync('vocab.txt', 'utf-8').toString();

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
    this.users = this.users.filter(user => user.id !== socket.id);
  }

  reset() {
    this.playerTurn = 0;
    this.roundNum = 0;
    this.score = 0;

    // Loop through the array and set guess and describe properties to 0 for each user
    for (let i = 0; i < this.users.length; i++) {
      this.users[i].data.describerPoints = 0;
      this.users[i].data.guesserPoints = 0;
    }
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
    io.to(roomGameMap[roomname].users[roomGameMap[roomname].playerTurn].id).emit('describe words', this.randomWords);
  }

  getPlayerTurn() {
    if (this.users[this.playerTurn]) {
      return this.users[this.playerTurn].id;
    }
  }

  getWords(numWords) {
    this.randomWords = [];
    for (let i = 0; i < numWords; ++i) {
      this.randomWords.push(this.words[Math.floor(Math.random() * this.words.length)]);
    }
  }

  processChat(msg, io, socket) {
    var roomname = socket.data.roomname;
    if (this.gameStarting) {
      const isCorrect = this.randomWords.includes(msg.trim().toLowerCase());
      io.to(roomname).emit('chat message', msg, socket.data.username, isCorrect, socket.id); // only send the message if it is right

      if (isCorrect) {
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

    if (i === 0) {
      roomGameMap[roomname].gameStarting = false;
      io.to(roomname).emit('toggle button', true);

      io.to(roomname).emit('describe words', roomGameMap[roomname].randomWords);
      io.to(roomname).emit('correct words', Array.from(roomGameMap[roomname].correctWords))

      roomGameMap[roomname].skipTurn();
      update(roomname);
    }
    await delay(1000); // Wait for 1 second
  }
}

function update(roomname) {
  io.to(roomname).emit('leaderboard info', roomGameMap[roomname].users.map(user => ({
    username: user.data.username,
    guesserPoints: user.data.guesserPoints,
    describerPoints: user.data.describerPoints,
    id: user.id,
  })), roomGameMap[roomname].getPlayerTurn());
  io.to(roomname).emit('update headers', roomGameMap[roomname].roundNum, roomGameMap[roomname].score);
}

app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/game', (req, res) => {
  res.sendFile(__dirname + '/public/game.html');
});

app.get('/create', (req, res) => {
  res.sendFile(__dirname + '/public/create.html');
});


io.on('connection', (socket) => {
  socket.on('request game state', () => {
    io.to(socket.data.roomname).emit('toggle button', !roomGameMap[socket.data.roomname].gameStarting);
    update(socket.data.roomname)
  });

  socket.on('reset game', () => {
    if (socket.data.roomname in roomGameMap) {
      roomGameMap[socket.data.roomname].reset();
      update(socket.data.roomname);
      io.to(socket.data.roomname).emit('describe words', []); // clears everyone board
    }
  });

  socket.on('join', (username, roomname, language) => {
    socket.data.username = username;
    socket.data.guesserPoints = 0;
    socket.data.describerPoints = 0;

    socket.data.roomname = roomname;
    socket.join(roomname);

    if (!(roomname in roomGameMap)) {
      if (language === 'en') {
        roomGameMap[roomname] = new Game(english)
      }
      else if (language === 'vi') {
        roomGameMap[roomname] = new Game(vietnamese)
      }
    }

    roomGameMap[roomname].users.push(socket);
    update(roomname);
  });

  socket.on('skip turn', () => {
    roomGameMap[socket.data.roomname].skipTurn();
    update(socket.data.roomname);
  })

  socket.on('disconnect', () => {
    if (socket.data.roomname in roomGameMap) {
      roomGameMap[socket.data.roomname].disconnect(socket);
      update(socket.data.roomname);
    }
  });

  socket.on('chat message', (msg) => {
    roomGameMap[socket.data.roomname].processChat(msg, io, socket);
  });

  socket.on('start game', () => {
    if (socket.data.roomname in roomGameMap) {
      roomGameMap[socket.data.roomname].start(io, socket.data.roomname);
      startGameTimer(socket.data.roomname);
    }
  });
});

server.listen(3000, () => {
  console.log('listening on *:3000');
});
