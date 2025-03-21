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
    const opponent1TimerRef = useRef(null);
    const opponent2TimerRef = useRef(null);

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

    function displayClue(row, col) {
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

    function concede(row, col) {
        clearBuzzerTimeout();
        setMessageLines(board[col][row].response.correct_response);
        setBoardState(row, col, 'closed');
        setResponseTimerIsActive(false);
        player.conceded = true;
        if (isContestantsDailyDouble(board[col][row], gameInfoContext.state.lastCorrect)) {
            updateOpponentScores(row, col);
        } else if (opponentControlsBoard()) {
            setTimeout(() => displayNextClue(), 2000);
        }
        if (gameInfoContext.state.lastCorrect === player.name) {
            setDisableClue(false);
        }
    }

    function readText(text) {
        msg.text = text;
        window.speechSynthesis.speak(msg);
        // keep the buzzer disabled for 500ms
        setTimeout(() => {
            gameInfoContext.dispatch({ type: 'enable_player_answer' });
            setResponseTimerIsActive(true);
        }, 500);
    }

    function getOpponentTimer(row, col, attempt, responseTime, incorrectContestants) {
        return setTimeout(() => {
            if (board[col][row].visible === 'closed') {
                setMessageLines(board[col][row].response.correct_response);    
            } else if (incorrectContestants.length > attempt - 1) {
                readText(incorrectContestants[attempt - 1]);
            } else if (board[col][row].response.correct_contestant !== gameInfoContext.state.weakest) {              
                readText(board[col][row].response.correct_contestant);             
            }
            updateOpponentScores(row, col);
        }, responseTime);
    }

    function handleOpponentAnswer(row, col, incorrectContestants, attempt) {
        let responseTime = getOpponentResponseTime(board[col][row].value, gameInfoContext.state.round);
        if (attempt === 2) {
            responseTime += 1200;
        }
        console.log('opponent response time (ms): ' + responseTime);
        if (attempt === 1) {
            opponent1TimerRef.current = getOpponentTimer(row, col, attempt, responseTime, incorrectContestants);
        } else if (attempt === 2) {
            opponent2TimerRef.current = getOpponentTimer(row, col, attempt, responseTime, incorrectContestants);
        }   
    }

    function opponentAnswer(row, col) {
        let incorrectContestants = board[col][row].response.incorrect_contestants
            .filter(contestant => contestant !== gameInfoContext.state.weakest)
            .filter(contestant => !answered.includes(contestant));
        handleOpponentAnswer(row, col, incorrectContestants, 1);
        // if both opponents answered, start another timer for the second contestant
        if (incorrectContestants.length > 1 || (incorrectContestants.length > 0 && board[col][row].response.correct_contestant !== gameInfoContext.state.weakest)) {
            handleOpponentAnswer(row, col, incorrectContestants, 2);
        } 
    }

    function startBuzzerTimeout(row, col) {
        let timeout = new Audio(Timeout);
        buzzerTimeoutRef.current = setTimeout(() => {
            timeout.play();
            concede(row, col);
        }, 5000);
    }

    function clearBuzzerTimeout() {
        if (buzzerTimeoutRef.current !== undefined) {
            clearTimeout(buzzerTimeoutRef.current);
            buzzerTimeoutRef.current = null;
        }
    }

    function clearOpponentTimer() {
        if (opponent1TimerRef.current) {
            clearTimeout(opponent1TimerRef.current);
            opponent1TimerRef.current = null;
        }    
        if (opponent2TimerRef.current) {
            clearTimeout(opponent2TimerRef.current);
            opponent2TimerRef.current = null;
        }    
    }

    function playerAnswer(row, col) {
        clearOpponentTimer();
        clearBuzzerTimeout();
        startBuzzerTimeout(row, col);
        console.log('player response time (ms): ' + Math.floor(response.seconds * 1000));
        stats.numClicks += 1;
        stats.totalClickResponseTime += Math.floor(response.seconds * 1000);
        gameInfoContext.dispatch({ type: 'disable_player_answer' });
        setResponseTimerIsActive(false);
        readText(playerName);
        response.countdown = true;
        setBoardState(row, col, 'eye');
        clearInterval(response.interval);
    }

    function handleIncorrectResponses(incorrectContestants, clue, scoreChange) {
        let incorrectMessage = '';
        clue.response.incorrect_responses = clue.response.incorrect_responses.filter(response =>
            !response.includes(gameInfoContext.state.weakest + ':'));
        for (let i = 0; i < incorrectContestants.length; i++) {
            if (incorrectContestants[i] !== gameInfoContext.state.weakest && !answered.includes(incorrectContestants[i])) {
                incorrectMessage += clue.response.incorrect_responses[i];
                scores[incorrectContestants[i]].score -= scoreChange;
                answered.push(incorrectContestants[i]);
                readText('No');
                response.seconds = 0;
            }
            break;
        }
        if (clue.daily_double_wager > 0 || player.conceded) {
            setMessageLines(incorrectMessage, clue.response.correct_response);
        } else {
            setMessageLines(incorrectMessage);
        }
        setScores(scores);

    }

    function handleCorrectResponse(correctContestant, scoreChange, clue, nextClueNumber, nextClue, row, col) {
        clearBuzzerTimeout();
        if (correctContestant && scores[correctContestant]) {
            gameInfoContext.dispatch({ type: 'set_last_correct_contestant', lastCorrect: correctContestant });
            scores[correctContestant].score += scoreChange;
        }
        setScores(scores);
        setBoardState(row, col, 'closed');
        setMessageLines(correctContestant + ': What is ' + clue.response.correct_response + '?');
        if (nextClueNumber > 0 && nextClue) {
            setTimeout(() => {
                setMessageLines(correctContestant + ': ' + nextClue.category + ' for $' + nextClue.value);
            }, 2000);
            response.seconds = 0;
            setTimeout(() => displayNextClue(), 4000);
        }
    }

    function getOpponentDailyDoubleWager(clue) {
        // don't change opponent score if this is not the same opponent who answered
        // the daily double in the actual broadcast game 
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

    function updateOpponentScores(row, col) {
        const clue = board[col][row];
        // don't update opponent score if this is the player's daily double
        if (isPlayerDailyDouble(row, col)) {
            return;
        }
        const nextClueNumber = getNextClueNumber();
        let message;
        let nextClue;
        if (nextClueNumber > 0) {
            nextClue = getClue(nextClueNumber);
        }
        if (nextClue) {
            message = gameInfoContext.state.lastCorrect + ': ' + nextClue.category + ' for $' + nextClue.value;
        }
        const incorrectContestants = clue.response.incorrect_contestants
            .filter(contestant => contestant !== gameInfoContext.state.weakest)
            .filter(contestant => !answered.includes(contestant));
        let correctContestant = clue.response.correct_contestant;
        if (correctContestant === gameInfoContext.state.weakest) {
            correctContestant = '';
        }
        let scoreChange = clue.daily_double_wager > 0 ? getOpponentDailyDoubleWager(clue) : clue.value;
        // handle triple stumpers
        if (incorrectContestants.length > 0) {
            handleIncorrectResponses(incorrectContestants, clue, scoreChange);
            if (player.conceded && gameInfoContext.state.lastCorrect !== playerName) {
                setTimeout(() => handleCorrectResponse(correctContestant, scoreChange, clue, nextClueNumber, nextClue, row, col), 3000);
            }
        } else if (!correctContestant) {
            if (incorrectContestants.length > 0) {
                handleIncorrectResponses(incorrectContestants, clue, scoreChange);
            }
            // go to next clue selected by opponent
            if (nextClueNumber > 0 && opponentControlsBoard()) {
                setTimeout(() => setMessageLines(message), 2500);
                setTimeout(() => displayNextClue(), 4500);
            }
        } else { // no incorrect responses
            handleCorrectResponse(correctContestant, scoreChange, clue, nextClueNumber, nextClue, row, col);
        }
    }

    function opponentControlsBoard() {
        console.log('lastCorrect: ' + gameInfoContext.state.lastCorrect);
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
                const clue = getClue(i);
                // if this is a daily double that was not answered by the contestant in the televised game, skip this clue
                if (clue && clue.daily_double_wager > 0 && !isContestantsDailyDouble(clue, gameInfoContext.state.lastCorrect)) {
                    continue;
                }
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
        msg.text = clue.text;
        window.speechSynthesis.speak(msg);
        msg.addEventListener('end', function clearClue() {
            gameInfoContext.dispatch({ type: 'update_image', imageUrl: '' });
            response.seconds = 0;
            if (isPlayerDailyDouble(row, col) && board[col][row].daily_double_wager > 0) {
                setBoardState(row, col, 'eye');
            } else if (board[col][row].daily_double_wager > 0) {
                concede(row, col);
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

    function isContestantsDailyDouble(clue, contestant) {
        return clue.response.correct_contestant === contestant || clue.response.incorrect_contestants.includes(contestant);
    }

    function isTripleStumper(row, col) {
        return !board[col][row].response.correct_contestant || board[col][row].response.correct_contestant === gameInfoContext.state.weakest;
    }

    function hasNoAttempts(row, col) {
        return isTripleStumper(row, col) && (board[col][row].response.incorrect_contestants.length === 0 || 
            (board[col][row].response.incorrect_contestants.length === 1 && board[col][row].response.incorrect_contestants[0] === gameInfoContext.state.weakest));
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
        clearBuzzerTimeout();
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
                                {!category[row].visible && <button className='clue' onClick={() => displayClue(row, column)} disabled={disableClue}>${category[row].value}</button>}
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