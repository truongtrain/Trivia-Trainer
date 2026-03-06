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
const initialGameInfo = { round: -1, imageUrl: 'logo', weakest: '', lastCorrect: '' };

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
    fetch('http://localhost:5000/game/9173')
      .then((res) => res.json())
      .then((data) => {
        showData = data;
        console.log(showData.jeopardy_round)
        setBoard(showData.jeopardy_round);
        loadPicks();
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
      contestant => tempContestants[contestant] = { score: 0, response: '', wager: null }
    );
    setScores(tempContestants);
  }

  function loadPicks() {
    showData.contestants.forEach(contestant => {
      let picks = [];
      showData.jeopardy_round_selections[contestant].forEach((selection, index) => {
        picks[index] = showData.jeopardy_clue_number_to_coordinates[selection];
      });
      //const picks = showData.jeopardy_round_selections[contestant];
      const frequencyMatrix = buildFrequencyMatrix(picks);
      const transitionMatrix = buildTransitionMatrix(picks);
      console.log(contestant)
      const profile = deriveProfileFromHistory(picks);
      console.log(frequencyMatrix)
      console.log(transitionMatrix)
      console.log(profile);
    });
  }

  function buildFrequencyMatrix(picks, rows = 5, cols = 6) { // track how often a contestant chooses each coordinate
    const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (const pick of picks) {
      matrix[pick.row][pick.col]++;
    }

    return matrix;
  }

  function buildTransitionMatrix(picks) { // track what clue tends to follow another clue
    const transitions = {};

    for (let i = 0; i < picks.length - 1; i++) {
      const fromKey = `${picks[i].row},${picks[i].col}`;
      const toKey = `${picks[i + 1].row},${picks[i + 1].col}`;

      if (!transitions[fromKey]) {
        transitions[fromKey] = {};
      }

      transitions[fromKey][toKey] = (transitions[fromKey][toKey] || 0) + 1;
    }

    return transitions;
  }

  function deriveProfileFromHistory(picks) {
    if (!picks || picks.length < 2) {
      return {
        sameCategoryWeight: 2.0,
        continueDownWeight: 2.0,
        bottomRowWeight: 2.0,
        jumpCategoryWeight: 1.0,
        dailyDoubleHuntWeight: 1.5,
        historicalWeight: 1.5,
        transitionWeight: 1.5,
        randomness: 0.2
      };
    }

    let sameCategoryCount = 0;
    let continueDownCount = 0;
    let jumpCount = 0;
    let totalRow = 0;

    for (let i = 0; i < picks.length; i++) {
      totalRow += picks[i].row;

      if (i > 0) {
        const prev = picks[i - 1];
        const curr = picks[i];

        if (curr.col === prev.col) sameCategoryCount++;
        if (curr.col === prev.col && curr.row === prev.row + 1) continueDownCount++;
        if (curr.col !== prev.col) jumpCount++;
      }
    }

    const transitions = picks.length - 1;
    const avgRow = totalRow / picks.length;

    return {
      sameCategoryWeight: 1 + (sameCategoryCount / Math.max(transitions, 1)) * 4,
      continueDownWeight: 1 + (continueDownCount / Math.max(transitions, 1)) * 4,
      bottomRowWeight: 1 + (avgRow / 4) * 3,
      jumpCategoryWeight: 0.5 + (jumpCount / Math.max(transitions, 1)) * 3,
      dailyDoubleHuntWeight: 1 + (avgRow / 4) * 2,
      historicalWeight: 2.0,
      transitionWeight: 2.0,
      randomness: 0.2
    };
  }

  function setUpDoubleJeopardyBoard() {
    dispatchGameInfo({ type: 'increment_round', round: 1.5 });
    let thirdPlace = player.name;
    Object.keys(scores).forEach(contestant => {
      if (scores[contestant].score < scores[thirdPlace].score) {
        thirdPlace = contestant;
      }
    });
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
    return <h1 className='center-screen'>Welcome to JEOPARDY!</h1>;
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
