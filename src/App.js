import './App.css';
import './index.scss';
import React, { useState, useEffect, useReducer, useRef } from 'react';
import { FullScreen, useFullScreenHandle } from 'react-full-screen';
import Podium from './components/Podium';
import Monitor from './components/Monitor';
import Name from './components/Name';
import Board from './components/Board';
import sampleGame from './resources/sample_game.json';

export const ScoreContext = React.createContext();
export const StartTimerContext = React.createContext();
export const PlayerContext = React.createContext();
export const GameInfoContext = React.createContext();

let showData = {};
let player = { name: '', finalResponse: '', wager: 0 };
let response = { seconds: 0, interval: {}, countdown: false };
let msg = new SpeechSynthesisUtterance();
let availableClueNumbers = new Array(30).fill(true);
const initialGameInfo = { round: -1, imageUrl: 'logo', weakest: '', lastCorrect: '', divergence: 0, revealedCols: [] };

function reducer(state, action) {
  switch (action.type) {
    case 'increment_round': {
      state.round = action.round;
      state.imageUrl = '';
      return state;
    }
    case 'update_image':
      state.imageUrl = action.imageUrl;
      return state;
    case 'set_weakest_contestant':
      state.weakest = action.weakest;
      return state;
    case 'set_last_correct_contestant':
      state.lastCorrect = action.lastCorrect;
      return state;
    case 'update_divergence':
      state.divergence = action.divergence;
      return state;
    case 'update_revealed_cols':
      state.revealedCols = action.revealedCols;
      return state;
    default:
      return state;
  }
}

const App = () => {
  const boardRef = useRef();
  const handle = useFullScreenHandle();
  const [gameInfo, dispatchGameInfo] = useReducer(reducer, initialGameInfo);
  const [responseTimerIsActive, setResponseTimerIsActive] = useState(false);
  const [disableClue, setDisableClue] = useState(false);
  const [scores, setScores] = useState(null);
  const [message, setMessage] = useState({ line1: '', line2: '' });
  const [board, setBoard] = useState(null);

  useEffect(() => {
    fetch('http://localhost:5000/game/9174')
      .then((res) => res.json())
      .then((data) => {
        showData = data;
        console.log(showData.jeopardy_round)
        setBoard(showData.jeopardy_round);
      },
        () => {
          // load sample game if service not available
          showData = sampleGame;
          setBoard(showData.jeopardy_round);
        })
  }, []);

  // determines how fast the player clicks after the clue is read
  useEffect(() => {
    if (responseTimerIsActive) {
      response.interval = setInterval(() => response.seconds += 0.01, 10);
    }
    return () => {
      clearInterval(response.interval);
    }
  }, [responseTimerIsActive]);

  function loadBoard(playerNameParam) {
    player.name = playerNameParam;
    loadContestants(playerNameParam);
    dispatchGameInfo({ type: 'increment_round', round: 0 });
  }

  function startRound() {
    if (gameInfo.round === 0) {
      dispatchGameInfo({ type: 'increment_round', round: 1 });
      boardRef.current.displayClueByNumber(1);
    } else if (gameInfo.round === 1) {
      setUpDoubleJeopardyBoard();
    } else if (gameInfo.round === 1.5) {
      dispatchGameInfo({ type: 'increment_round', round: 2 });
      boardRef.current.displayClueByNumber(1);
    } else if (gameInfo.round === 2) {
      showFinalJeopardyCategory();
    }
  }

  function loadContestants(playerNameParam) {
    dispatchGameInfo({ type: 'set_last_correct_contestant', lastCorrect: showData.contestants[0] });
    let filteredContestants = showData.contestants;
    filteredContestants.push(playerNameParam);
    let tempContestants = {};
    filteredContestants.forEach(
      contestant => tempContestants[contestant] = {
        score: 0, response: '', wager: null, categoryStats: Array.from({ length: 6 }, () => {
          return { correct: 0, wrong: 0, timesSelected: 0 };
        })
      }
    );
    setScores(tempContestants);
  }

  function setUpDoubleJeopardyBoard() {
    dispatchGameInfo({ type: 'increment_round', round: 1.5 });
    dispatchGameInfo({ type: 'update_divergence', divergence: 0 });
    dispatchGameInfo({ type: 'update_revealed_cols', revealedCols: [] });
    let thirdPlace = player.name;
    Object.keys(scores).forEach(contestant => {
      if (scores[contestant].score < scores[thirdPlace].score) {
        thirdPlace = contestant;
      }
      scores[contestant].categoryStats = Array.from({ length: 6 }, () => {
        return { correct: 0, wrong: 0, timesSelected: 0 };
      });
    });

    setScores(scores);
    dispatchGameInfo({ type: 'set_last_correct_contestant', lastCorrect: thirdPlace });
    setBoard(showData.double_jeopardy_round);
    console.log(showData.double_jeopardy_round);
    availableClueNumbers = new Array(30).fill(true);
    setMessageLines('');
    setDisableClue(false);
  }

  function setMessageLines(text1, text2 = '') {
    setMessage({
      line1: text1,
      line2: text2
    });
  }

  function showFinalJeopardyCategory() {
    dispatchGameInfo({ type: 'increment_round', round: 3 });
    setMessageLines('');
    msg.text = 'The final jeopardy category is ' + showData.final_jeopardy.category + '. How much will you wager';
    window.speechSynthesis.speak(msg);
  }

  function enterFullScreen() {
    if (!handle.active && window.innerWidth > 1000) {
      handle.enter();
    }
  }

  if (!board) {
    return <h1 className='center-screen'>Welcome to Trivia Trainer!</h1>;
  }
  return (
    gameInfo.round === -1 ? <Name loadBoard={loadBoard} /> :
      <FullScreen handle={handle}>
        <ScoreContext.Provider value={scores}>
          <StartTimerContext.Provider value={response.countdown}>
            <PlayerContext.Provider value={player.name}>
              <GameInfoContext.Provider value={{ state: gameInfo, dispatch: dispatchGameInfo }}>
                <main>
                  <meta name='viewport' content='width=device-width, initial-scale=1' />
                  <Podium />
                  <div id='monitor-container' onClick={startRound}>
                    <Monitor message={message} imageUrl={gameInfo.imageUrl} />
                  </div>
                  <Board ref={boardRef} board={board} setBoard={setBoard}
                    disableClue={disableClue} setDisableClue={setDisableClue}
                    setMessageLines={setMessageLines} availableClueNumbers={availableClueNumbers}
                    player={player} showData={showData} setScores={setScores}
                    msg={msg} response={response} enterFullScreen={enterFullScreen}
                    setResponseTimerIsActive={setResponseTimerIsActive} />
                </main>
              </GameInfoContext.Provider>
            </PlayerContext.Provider>
          </StartTimerContext.Provider>
        </ScoreContext.Provider>
      </FullScreen>
  );
}

export default App;
