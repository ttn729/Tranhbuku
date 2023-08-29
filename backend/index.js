const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

const fs = require('fs');

const vocab = fs.readFileSync('vocab.txt', 'utf-8').toString();

var words = [];
var randomWords = [];

vocab.split('\r\n').forEach(line => {
  words.push(line);
})

const DEFAULT_NUM_WORDS = 20;
const DEFAULT_TURN_TIME = 10;
 
let usernameMap = {};
let users = [];
let gameStarting = false;
let correctWords = new Set();
let roundNum = 0;
let score = 0;
let playerTurn = 0;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startGameTimer() {
  for (let i = DEFAULT_TURN_TIME; i >= 0; i--) {
    // console.log(i);
    io.emit('set timer', 'Time: ' + i);

    if (i == 0) {
      gameStarting = false;
      io.emit('toggle button', true);
      io.emit('describe words', randomWords);
      io.emit('correct words', Array.from(correctWords))
      io.emit('player turn', playerTurn);
    }
    await delay(1000); // Wait for 1 second
  }
}

async function getWords(numWords) {

  randomWords = [];

  for (let i = 0; i < numWords; ++i) {
    randomWords.push(words[Math.floor(Math.random() * words.length)])
  }

  console.log(randomWords);
  io.to(users[playerTurn]).emit('describe words', randomWords);
}

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', (socket) => {
  console.log('a user connected');

  socket.on('request game state', () => {
    if (roundNum == 0) {
      io.emit('player turn', 0);
    }
    else {
      io.emit('player turn', playerTurn);
    }
    io.emit('toggle button', !gameStarting);
    io.emit('update headers', roundNum, score);
  });

  socket.on('join', (username) => {
    usernameMap[socket.id] = username;
    users.push(socket.id);
    console.log("User joined, now new length is " + users.length);
    socket.data.username = username;
    io.emit('chat message', username + ' has entered the chat.', 'SYSTEM');
    io.emit('update users', Object.values(usernameMap));
  });

  socket.on('skip turn', () => {
    playerTurn = (playerTurn + 1) % users.length;
    io.emit('player turn', playerTurn);
  })
  
  socket.on('disconnect', () => {
    console.log('user ' + socket.data.username  + ' has disconnected');
    io.emit('chat message', usernameMap[socket.id] + ' has disconnected.', 'SYSTEM');
    delete usernameMap[socket.id];
    users.splice(users.indexOf(socket.id),1);
    console.log(users);
    io.emit('update users', Object.values(usernameMap));
  });

  socket.on('chat message', (msg, username) => {
    console.log('message: ' + msg + ' username: ' + username);
    io.emit('chat message', msg, username);

    if (gameStarting) {
      if (randomWords.includes(msg)) {
        console.log(msg, randomWords.indexOf(msg));

        const prevLength = correctWords.size;
        correctWords.add(randomWords.indexOf(msg));

        const afterLength = correctWords.size;

        if (afterLength > prevLength) {
          score += 6
          io.emit('update headers', roundNum, score);
        }
        io.emit('correct words', Array.from(correctWords));
      }
    }

  });

  socket.on('start game', () => {
    console.log('start game', playerTurn);
    correctWords.clear();
    io.emit('correct words', Array.from(correctWords))
    io.emit('describe words', []); // clears everyone board


    getWords(DEFAULT_NUM_WORDS);

    playerTurn = (playerTurn + 1) % users.length;
    console.log(users);
    console.log("next player is ", playerTurn);

    gameStarting = true;

    roundNum += 1;
    io.emit('update headers', roundNum, score);

    io.emit('toggle button', false);
    startGameTimer();
  });

});

const localIP = '10.204.82.7';

server.listen(3000, () => {
  console.log('listening on *:3000');
});

// app.listen(3000, localIP, () => {
//   console.log(`Server is running at http://${localIP}:${3000}`);
// });