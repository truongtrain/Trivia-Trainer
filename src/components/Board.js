import { BiShow } from 'react-icons/bi';
import { FcApprove } from 'react-icons/fc';
import { FcDisapprove } from 'react-icons/fc';
import { HiHandRaised } from 'react-icons/hi2';
import FinalMusic from '../resources/final_jeopardy.mp3';
import Timeout from '../resources/timeout.mp3';
import { forwardRef, useContext, useImperativeHandle, useRef } from 'react';
import { ScoreContext, PlayerContext, GameInfoContext } from '../App';

let stats = { numCorrect: 0, numClues: 0, battingAverage: 0, coryatScore: 0, totalClickResponseTime: 0, numClicks: 0, averageClickResponseTime: 0 };
let answered = [];

const Board = forwardRef((props, ref) => {
    const scores = useContext(ScoreContext);
    const playerName = useContext(PlayerContext);
    const gameInfoContext = useContext(GameInfoContext);
    let { board, setBoard, disableClue, setDisableClue,
        setMessageLines, availableClueNumbers,
        player, showData, setScores, enterFullScreen,
        msg, response, setResponseTimerIsActive } = props;
    const buzzerTimeoutRef = useRef(null);
    const opponentTimerRef = useRef(null);
    const opponentIndexRef = useRef(0);

    useImperativeHandle(ref, () => ({
        displayClueByNumber
    }));

    function getCategory(column) {
        let i = 0;
        while (i < column.length && !column[i].category) {
            i++;
        }
        return column[i].category;
    }

    function displayClueByNumber(clueNumber) {
        enterFullScreen();
        player.conceded = false;
        gameInfoContext.dispatch({ type: 'enable_player_answer' });
        answered = [];
        updateAvailableClueNumbers(clueNumber);
        for (let col = 0; col < 6; col++) {
            for (let row = 0; row < 5; row++) {
                if (board[col][row].number === clueNumber) {
                    if (!isPlayerDailyDouble(row, col) && board[col][row].daily_double_wager > 0) {
                        if (gameInfoContext.state.lastCorrect !== player.name) {
                            setMessageLines('Daily Double', gameInfoContext.state.lastCorrect + ': I will wager $' + getOpponentDailyDoubleWager(board[col][row]));
                        }
                    }
                    setBoardState(row, col, 'clue');
                    if (isPlayerDailyDouble(row, col) && !board[col][row].url) {
                        setMessageLines(board[col][row].text);
                    }
                    readClue(row, col);
                    return;
                }
            }
        }
    }

    function isFinalJeopardyCategoryCell(row, col) {
        return row === 1 && col === 3;
    }

    function isFinalJeopardyResponseCell(row, col) {
        return row === 2 && col === 3;
    }

    async function displayClue(row, col) {
        enterFullScreen();
        if (gameInfoContext.state.round === 0) {
            gameInfoContext.dispatch({ type: 'increment_round', round: 1 });
        } else if (gameInfoContext.state.round === 1.5) {
            gameInfoContext.dispatch({ type: 'increment_round', round: 2 });
        }
        player.conceded = false;
        answered = [];
        gameInfoContext.dispatch({ type: 'set_last_correct_contestant', lastCorrect: playerName });
        const clue = board[col][row];
        if (clue.daily_double_wager > 0) {
            player.wager = scores[playerName].score;
            setBoardState(row, col, 'wager');
            readText('Answer. Daily double. How much will you wager');
        } else {
            setMessageLines('');
            response.seconds = 0;
            response.countdown = false;
            updateAvailableClueNumbers(clue.number);
            setBoardState(row, col, 'clue');
            readClue(row, col);
        }
    }

    function isPlayerDailyDouble(row, col) {
        return gameInfoContext.state.lastCorrect === player.name && board[col][row].daily_double_wager > 0;
    }

    function getNextClueInfo() {
        const nextClueNumber = getNextClueNumber();
        let message;
        let nextClue;
        if (nextClueNumber > 0) {
            nextClue = getClue(nextClueNumber);
        }
        if (nextClue) {
            message = gameInfoContext.state.lastCorrect + ': ' + nextClue.category + ' for $' + nextClue.value;
        }
        return { nextClueNumber: nextClueNumber, nextClue: nextClue, message: message};
    }

    function readText(text, delayAfter = 0) {
        //msg.text = text;
        //window.speechSynthesis.speak(msg);

        // keep the buzzer disabled for 500ms
        setTimeout(() => {
            gameInfoContext.dispatch({ type: 'enable_player_answer' });
            setResponseTimerIsActive(true);
        }, 500);
        // speak after delay
        return new Promise(resolve => {
            const u = new SpeechSynthesisUtterance(text);
            u.onend = () => setTimeout(resolve, delayAfter);
            speechSynthesis.speak(u);
        });
    }

    async function applyOpponentResponse(row, col, response) {
        const clue = board[col][row];
            const scoreChange = clue.daily_double_wager > 0 ? getOpponentDailyDoubleWager(clue) : clue.value;
            if (board[col][row].visible === 'closed') {
                setMessageLines(board[col][row].response.correct_response);    
            } else if (!response.correct) { // handle incorrect response
                await readText(response.contestant);
                readText('No', 1000);
                setMessageLines(response.response);
                setScores(prev => {
                    const next = structuredClone(prev);
                    next[response.contestant].score -= scoreChange;
                    return next;
                });
                response.seconds = 0;
            } else { // handle correct response
                await readText(response.contestant);
                setMessageLines(response.contestant + ': What is ' + response.response + '?');
                setScores(prev => {
                    const next = structuredClone(prev);
                    next[response.contestant].score += scoreChange;
                    return next;
                });
                gameInfoContext.dispatch({
                    type: 'set_last_correct_contestant',
                    lastCorrect: response.contestant
                });
                setBoardState(row, col, 'closed');
                opponentSelectsClue(); 
            }
            clearBuzzerTimeout();
    }

    function startOpponentResponseSequence(row, col, responses, responseTime) {
        if (opponentTimerRef.current) {
            clearTimeout(opponentTimerRef.current);
            opponentTimerRef.current = null;
        }
        if (!responses?.length) return;

        opponentIndexRef.current = 0;
        const runStep = () => {
            if (board[col][row].visible === 'closed') return;

            const i = opponentIndexRef.current;
            console.log(responses[i].contestant + ' response time (ms): ' + responseTime);
            applyOpponentResponse(row, col, responses[i]);
            opponentIndexRef.current += 1;
            if (opponentIndexRef.current >= responses.length) return;

            opponentTimerRef.current = setTimeout(runStep, responseTime + 2000);
        };
        opponentTimerRef.current = setTimeout(runStep, responseTime);
    }

    function opponentAnswer(row, col) {
        let incorrectContestants = board[col][row].response.incorrect_contestants;
        let responses = [];
        for (let i = 0; i < incorrectContestants.length; i++) {
            responses.push({
                contestant: incorrectContestants[i],
                response: board[col][row].response.incorrect_responses[i],
                correct: false
            });        
        }
        if (board[col][row].response.correct_contestant) {
            responses.push({
                contestant: board[col][row].response.correct_contestant,
                response: board[col][row].response.correct_response,
                correct: true
            });        
        }
        let responseTime = getOpponentResponseTime(board[col][row].value, gameInfoContext.state.round);
        startOpponentResponseSequence(row, col, responses, responseTime);
    }

    function opponentSelectsClue() {
        // go to next clue selected by opponent
        let nextClueInfo = getNextClueInfo();
        if (nextClueInfo.nextClueNumber > 0 && nextClueInfo.nextClue && opponentControlsBoard()) {
            setTimeout(() => {
                setMessageLines(gameInfoContext.state.lastCorrect + ': ' + nextClueInfo.nextClue.category + ' for $' + nextClueInfo.nextClue.value);
            }, 2000);
            response.seconds = 0;
            setTimeout(() => displayNextClue(), 4000);
        }
    }

    function startBuzzerTimeout(row, col, isPlayerAnswer = false) {
        let timeout = new Audio(Timeout);
        buzzerTimeoutRef.current = setTimeout(() => {
            timeout.play();    
            if (isPlayerAnswer) {
                deductScore(row, col);
            } else if (isTripleStumper(row, col)) {
                showAnswer(row, col);
                setTimeout(() => displayNextClue(), 2000);
            }   
            setBoardState(row, col, 'closed');
        }, 5000);
    }

    function clearBuzzerTimeout() {
        if (buzzerTimeoutRef.current) {
            clearTimeout(buzzerTimeoutRef.current);
            buzzerTimeoutRef.current = null;
        }
    }

    function clearOpponentTimer() {
        if (opponentTimerRef.current) {
            clearTimeout(opponentTimerRef.current);
            opponentTimerRef.current = null;
        }    
    }

    async function playerAnswer(row, col) {
        clearOpponentTimer();
        clearBuzzerTimeout();
        startBuzzerTimeout(row, col, true);
        console.log('player response time (ms): ' + Math.floor(response.seconds * 1000));
        stats.numClicks += 1;
        stats.totalClickResponseTime += Math.floor(response.seconds * 1000);
        gameInfoContext.dispatch({ type: 'disable_player_answer' });
        setResponseTimerIsActive(false);
        await readText(playerName);
        response.countdown = true;
        setBoardState(row, col, 'eye');
        clearInterval(response.interval);
    }

    function getOpponentDailyDoubleWager(clue) {
        // don't change opponent score if this is not the same opponent who answered the daily double in the actual broadcast game 
        if (!gameInfoContext.state.lastCorrect || (clue.response.correct_contestant && clue.response.correct_contestant !== gameInfoContext.state.lastCorrect)) {
            return 0;
        }
        const currentScore = scores[gameInfoContext.state.lastCorrect].score;
        if (gameInfoContext.state.round === 1) {
            if (clue.daily_double_wager > currentScore) {
                if (currentScore > 1000) {
                    return currentScore;
                }
                return 1000;
            }
        } else if (gameInfoContext.state.round === 2) {
            if (clue.daily_double_wager > currentScore) {
                if (currentScore > 1000) {
                    return currentScore;
                }
                return 2000;
            }
        }
        return clue.daily_double_wager;
    }

    function opponentControlsBoard() {
        return gameInfoContext.state.lastCorrect !== player.name;
    }

    function displayNextClue() {
        setResponseTimerIsActive(false);
        answered = [];
        setMessageLines('');
        const nextClueNumber = getNextClueNumber();
        if (nextClueNumber > 0) {
            displayClueByNumber(nextClueNumber);
        } else {
            gameInfoContext.dispatch({ type: 'update_image', imageUrl: 'logo' });
        }
    }

    function displayClueImage(row, col) {
        const url = board[col][row].url;
        if (url) {
            gameInfoContext.dispatch({ type: 'update_image', imageUrl: url });
            setMessageLines('');
        } else {
            gameInfoContext.dispatch({ type: 'update_image', imageUrl: '' });
        }
    }

    function getNextClueNumber() {
        for (let i = 1; i <= 30; i++) {
            if (availableClueNumbers[i - 1] === true) {
                return i;
            }
        }
        return -1;
    }

    function updateAvailableClueNumbers(clueNumber) {
        availableClueNumbers[clueNumber - 1] = false;
    }

    function getClue(clueNumber) {
        for (let col = 0; col < 6; col++) {
            for (let row = 0; row < 5; row++) {
                if (board && board[col][row].number === clueNumber) {
                    return board[col][row];
                }
            }
        }
        return null;
    }

    function normalizeSpokenText(msg) {
        return msg.replace(/____/g, "blank") // underscores
                    .replace(/THE/g, "the") // the
                    .replace(/"/g, "") // quotes
                    .replace(/&/g, "and") // ampersands
                    .toLowerCase();
    }

    function readClue(row, col) {
        setDisableClue(true);
        stats.numClues += 1;
        let clue;
        if (gameInfoContext.state.round <= 1) {
            clue = showData.jeopardy_round[col][row];
        } else if (gameInfoContext.state.round === 2 || gameInfoContext.state.round === 1.5) {
            clue = showData.double_jeopardy_round[col][row];
        }
        displayClueImage(row, col);
        msg.text = normalizeSpokenText(clue.text);
        window.speechSynthesis.speak(msg);
        msg.addEventListener('end', function clearClue() {
            gameInfoContext.dispatch({ type: 'update_image', imageUrl: '' });
            response.seconds = 0;
            if (isPlayerDailyDouble(row, col) && board[col][row].daily_double_wager > 0) {
                setBoardState(row, col, 'eye');
            } else if (board[col][row].daily_double_wager > 0) {
                opponentAnswer(row, col); 
            } else if (board[col][row].visible === 'clue') {
                setBoardState(row, col, 'buzzer');
                startBuzzerTimeout(row, col);
                if (!hasNoAttempts(row, col)) {
                    opponentAnswer(row, col);            
                }
            }
            setResponseTimerIsActive(true);
            msg.removeEventListener('end', clearClue, true);
        }, true);
    }

    function setBoardState(row, col, state) {
        const board_copy = [...board];
        board[col][row].visible = state;
        setBoard(board_copy);
    }

    function isTripleStumper(row, col) {
        return !board[col][row].response.correct_contestant;
    }

    function hasNoAttempts(row, col) {
        return isTripleStumper(row, col) && (board[col][row].response.incorrect_contestants.length === 0);
    }

    function getOpponentResponseTime(value, round) {
        const min = 120; // in milliseconds
        let max;
        if (round <= 1) {
            switch (value) {
                case 200:
                    max = 200; // 120-200ms
                    break;
                case 400:
                    max = 210; // 120-210ms
                    break;
                case 600:
                    max = 220; // 120-220ms
                    break;
                case 800:
                    max = 230; // 120-230ms
                    break;
                case 1000:
                    max = 240; // 120-240ms
                    break;
                default:
                    max = 220;
            }
        } else if (round === 2) {
            switch (value) {
                case 400:
                    max = 220; // 120-220ms
                    break;
                case 800:
                    max = 230; // 120-230ms
                    break;
                case 1200:
                    max = 240; // 120-240ms
                    break;
                case 1600:
                    max = 250; // 120-250ms
                    break;
                case 2000:
                    max = 260; // 120-260ms    
                    break;   
                default:
                    max = 240;      
            }
        }
        return Math.floor(Math.random() * (max - min + 1) + min);
    }

    function incrementScore(row, col) {
        setDisableClue(false);
        gameInfoContext.dispatch({ type: 'set_last_correct_contestant', lastCorrect: playerName });
        msg.text = 'Correct';
        window.speechSynthesis.speak(msg);
        if (board[col][row].daily_double_wager > 0) {
            scores[playerName].score += +player.wager;
        } else {
            scores[playerName].score += board[col][row].value;
        }
        setScores(scores);
        stats.coryatScore += board[col][row].value;
        stats.numCorrect += 1;
        resetClue(row, col);
    }

    function deductScore(row, col) {
        msg.text = 'No';
        window.speechSynthesis.speak(msg);
        if (board[col][row].daily_double_wager > 0) {
            scores[playerName].score -= player.wager;
        } else {
            scores[playerName].score -= board[col][row].value;
            stats.coryatScore -= board[col][row].value;
        }
        setScores(scores);
        opponentAnswer(row, col); 
        resetClue(row, col);
        setDisableClue(false);
    }

    function resetClue(row, col) {
        setBoardState(row, col, 'closed');
        setResponseTimerIsActive(false);
        response.countdown = false;
    }

    function showAnswer(row, col) {
        clearBuzzerTimeout();
        setResponseTimerIsActive(false);
        response.countdown = false;
        setBoardState(row, col, 'judge');
        if (gameInfoContext.state.round === 3) {
            setMessageLines(showData.final_jeopardy.correct_response);
        } else {
            setMessageLines(board[col][row].response.correct_response);
        }
    }

    function submit(row, col) {
        if (gameInfoContext.state.round === 3) {
            document.getElementById('final-input').value = null;
            gameInfoContext.dispatch({ type: 'disable_player_answer' });
            response.countdown = false;
            setScores(scores);
            showFinalJeopardyClue();
        } else {
            setBoardState(row, col, 'clue');
            displayClueByNumber(board[col][row].number);
        }
    }

    function showFinalJeopardyClue() {
        let finalMusic = new Audio(FinalMusic);
        setBoardState(1, 3, 'final');
        gameInfoContext.dispatch({ type: 'update_image', imageUrl: showData.final_jeopardy.url });
        msg.text = showData.final_jeopardy.clue;
        window.speechSynthesis.speak(msg);
        msg.addEventListener('end', () => {
            finalMusic.play();
        });
        finalMusic.addEventListener('ended', () => {
            showFinalJeopardyResults();
        });
    }

    function showFinalJeopardyResults() {
        stats.battingAverage = stats.numCorrect / stats.numClues * 1.0;
        stats.averageClickResponseTime = stats.totalClickResponseTime / stats.numClicks;
        console.log(stats);
        scores[playerName].response = player.finalResponse;
        scores[playerName].wager = player.wager;
        Object.keys(scores).forEach(contestant => {
            showData.final_jeopardy.contestant_responses.forEach(response => {
                if (response.contestant === contestant) {
                    scores[contestant].response = response.response;
                    scores[contestant].wager = 0;
                    if (scores[contestant].score >= response.wager) {
                        scores[contestant].wager = response.wager;
                    } else {
                        scores[contestant].wager = scores[contestant].score;
                    }
                }
            });
        });
        setScores(scores);
        gameInfoContext.dispatch({ type: 'update_image', imageUrl: '' });
        setMessageLines(showData.final_jeopardy.correct_response);
    }

    const handleInputChange = event => {
        if (isNaN(event.target.value)) {
            player.finalResponse = event.target.value;
        } else {
            player.wager = event.target.value;
        }
    }


    return (
        <table id='board'>
            <thead>
                <tr id='headers'>
                    {Array.from(Array(6), (_arrayElement, row) =>
                        <th key={'header' + row}>{gameInfoContext.state.round !== 3 && getCategory(board[row])}
                            {board[row][0].category_note && <span className='tooltip'>{board[row][0].category_note}</span>}
                        </th>
                    )}
                </tr>
            </thead>
            <tbody>
                {Array.from(Array(5), (_arrayElement, row) =>
                    <tr key={'row' + row}>
                        {board.map((category, column) =>
                            <td key={'column' + column}>
                                {!category[row].visible && <button className='clue' onClick={() => displayClue(row, column)}>${category[row].value}</button>}
                                <span>{category[row] && category[row].visible === 'clue' && category[row].text}</span>
                                {category[row].visible === 'buzzer' && category[row].daily_double_wager === 0 &&
                                    <div className='clue'>
                                        <button className='answer-button buzzer-button' onClick={() => playerAnswer(row, column)} disabled={gameInfoContext.state.disableAnswer}><HiHandRaised /></button>
                                    </div>
                                }
                                {category[row].visible === 'eye' &&
                                    <div>
                                        <button className='eye-button' onClick={() => showAnswer(row, column)}><BiShow /></button>
                                    </div>
                                }
                                {category[row].visible === 'judge' &&
                                    <div className='clue'>
                                        <button className='answer-button' onClick={() => incrementScore(row, column)}><FcApprove /></button>
                                        <button className='answer-button' onClick={() => deductScore(row, column)}><FcDisapprove /></button>
                                    </div>
                                }
                                {category[row].visible === 'wager' &&
                                    <div>
                                        ENTER YOUR WAGER:
                                        <div className='wager'>
                                            <button className='submit-button' onClick={() => submit(row, column)}>SUBMIT</button>
                                            <input defaultValue={player.wager} onChange={handleInputChange} />
                                        </div>
                                    </div>
                                }
                                {gameInfoContext.state.round === 3 && isFinalJeopardyCategoryCell(row, column) && category[row].visible !== 'final' &&
                                    <h3>
                                        {showData.final_jeopardy.category}
                                    </h3>
                                }
                                {isFinalJeopardyCategoryCell(row, column) && category[row].visible === 'final' &&
                                    <div>
                                        {showData.final_jeopardy.clue.toUpperCase()}
                                    </div>
                                }
                                {gameInfoContext.state.round === 3 && isFinalJeopardyResponseCell(row, column) &&
                                    <div>
                                        {board[3][1].visible !== 'final' && <span>ENTER YOUR WAGER:</span>}
                                        {board[3][1].visible === 'final' && <span>ENTER YOUR RESPONSE:</span>}
                                        <div className='wager'>
                                            {board[3][1].visible !== 'final' && <button id='final-submit-button' className='submit-button' onClick={submit}>SUBMIT</button>}
                                            <input id='final-input' defaultValue={player.wager} onChange={handleInputChange} />
                                        </div>
                                    </div>
                                }
                            </td>
                        )}
                    </tr>
                )}
            </tbody>
        </table>
    );
})

export default Board;