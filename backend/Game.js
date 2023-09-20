
class Game {
    constructor(vocab, wordsPerTurn, startingTime) {
      this.words = vocab.split('\n').map(line => line.trim().toLowerCase());
      this.randomWords = [];
      this.users = [];
      this.gameStarting = false;
      this.correctWords = new Set();
      this.roundNum = 0;
      this.score = 0;
      this.playerTurn = 0;
      this.wordsPerTurn = wordsPerTurn;
      this.startingTime = startingTime;
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
  
    start() {
      this.correctWords.clear();
      this.gameStarting = true;
      this.roundNum += 1;
      this.getWords(this.wordsPerTurn);
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
  }

  module.exports = {Game};