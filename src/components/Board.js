import { BiShow } from 'react-icons/bi';
import { FcApprove } from 'react-icons/fc';
import { FcDisapprove } from 'react-icons/fc';
import { HiHandRaised } from 'react-icons/hi2';
import FinalMusic from '../resources/final_jeopardy.mp3';
import Timeout from '../resources/timeout.mp3';
import { forwardRef, useContext, useImperativeHandle, useRef, useEffect } from 'react';
import { ScoreContext, PlayerContext, GameInfoContext } from '../App';

let stats = { numCorrect: 0, numClues: 0, battingAverage: 0, coryatScore: 0, totalClickResponseTime: 0, numClicks: 0, averageClickResponseTime: 0 };

const Board = forwardRef((props, ref) => {
    const scores = useContext(ScoreContext);
    const playerName = useContext(PlayerContext);
    const gameInfoContext = useContext(GameInfoContext);
    let { board, setBoard, disableClue, setDisableClue,
        setMessageLines, availableClueNumbers,
        player, showData, setScores,
        msg, response, setResponseTimerIsActive } = props;
    const buzzerTimeoutRef = useRef(null);
    const opponentTimerRef = useRef(null);
    const opponentIndexRef = useRef(0);
    const scoresRef = useRef(scores);

    useEffect(() => {
        scoresRef.current = scores;
    }, [scores]);

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
        for (let col = 0; col < 6; col++) {
            for (let row = 0; row < 5; row++) {
                if (board[col][row].number === clueNumber) {
                    if (!isPlayerDailyDouble(row, col) && board[col][row].daily_double_wager > 0) {
                        if (gameInfoContext.state.lastCorrect !== player.name) {
                            setMessageLines('Daily Double', gameInfoContext.state.lastCorrect + ': I will wager $' + getOpponentDailyDoubleWager(board[col][row], row, col));
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
        if (gameInfoContext.state.round === 0) {
            gameInfoContext.dispatch({ type: 'increment_round', round: 1 });
        } else if (gameInfoContext.state.round === 1.5) {
            gameInfoContext.dispatch({ type: 'increment_round', round: 2 });
        }
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
            setBoardState(row, col, 'clue');
            readClue(row, col);
        }
    }

    function isPlayerDailyDouble(row, col) {
        return gameInfoContext.state.lastCorrect === player.name && board[col][row].daily_double_wager > 0;
    }

    function getNextHistoricalClueNumber() {
        for (let i = 1; i <= 30; i++) {
            if (availableClueNumbers[i - 1] === true) {
                return i;
            }
        }
        return null;
    }

    function getNextClueInfo(row, col) {
        let nextClueNumber;
        const nextHistoricalClueNumber = getNextHistoricalClueNumber();
        if (!nextHistoricalClueNumber) {
            return null;
        }
        const candidate = gameInfoContext.state.round === 1 ? showData.jeopardy_clue_number_to_coordinates[nextHistoricalClueNumber] : showData.double_jeopardy_clue_number_to_coordinates[nextHistoricalClueNumber];
        const previousPick = { row: row, col: col };
        const opponent = gameInfoContext.state.lastCorrect;
        const profile = gameInfoContext.state.round === 1 ? showData.jeopardy_round_player_profiles[opponent] : showData.double_jeopardy_round_player_profiles[opponent];
        const freqMatrix = gameInfoContext.state.round === 1 ? showData.jeopardy_round_frequency_matrix[opponent] : showData.double_jeopardy_round_frequency_matrix[opponent];
        const transitions = gameInfoContext.state.round === 1 ? showData.jeopardy_round_transition_matrix[opponent] : showData.double_jeopardy_round_transition_matrix[opponent];
        const leaderScore = Math.max(...Object.values(scores).map(s => s.score));
        const playerScore = scores[opponent].score;
        const historicalScore = scoreClueAdvanced({
            candidate,
            previousPick,
            profile,
            freqMatrix,
            transitions,
            playerScore,
            leaderScore
        });
        const divergence = gameInfoContext.state.divergence;
        // If the game has not diverged much and the historical clue still makes sense, follow the historical script
        if (divergence <= 1 && historicalScore > 0.01) {
            nextClueNumber = nextHistoricalClueNumber;
        } else { // if divergence is high, don't follow the historical script
            nextClueNumber = chooseClueAdvanced(previousPick);
        }

        let message;
        let nextClue;
        if (nextClueNumber) {
            nextClue = getClue(nextClueNumber);
        }
        if (nextClue) {
            message = gameInfoContext.state.lastCorrect + ': ' + nextClue.category + ' for $' + nextClue.value;
        }
        return { nextClueNumber: nextClueNumber, nextClue: nextClue, message: message };
    }

    function readText(text, delayAfter = 0) {
        // keep the buzzer disabled for 500ms
        setTimeout(() => {
            setResponseTimerIsActive(true);
        }, 500);
        // speak after delay
        return new Promise(resolve => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.onstart = () => setDisableClue(true);
            utterance.onend = () => {
                setDisableClue(false);
                setTimeout(resolve, delayAfter);
            }
            utterance.onerror = () => setDisableClue(false);
            speechSynthesis.speak(utterance);
        });
    }

    async function applyOpponentResponse(row, col, response) {
        setDisableClue(true);
        const clue = board[col][row];
        const scoreChange = clue.daily_double_wager > 0 ? getOpponentDailyDoubleWager(clue, row, col) : clue.value;

        if (clue.daily_double_wager > 0 && (clue.response.correct_contestant !== gameInfoContext.state.lastCorrect)) {
            response.correct = Math.random() < estimateDailyDoubleAccuracy(response.contestant, row, col);
            response.contestant = gameInfoContext.state.lastCorrect;
        }

        if (board[col][row].visible === 'closed') {
            setMessageLines(board[col][row].response.correct_response);
        } else if (!response.correct) { // handle incorrect response
            board[col][row].answered_contestants.push(response.contestant);
            await readText(response.contestant);
            readText('No', 1000);
            setMessageLines(response.response);
            setScores(prev => {
                const next = structuredClone(prev);
                next[response.contestant].score -= scoreChange;
                next[response.contestant].categoryStats[col].wrong += 1;
                next[response.contestant].categoryStats[col].timesSelected += 1;
                return next;
            });
            response.seconds = 0;
            if (clue.daily_double_wager > 0) {
                setBoardState(row, col, 'closed');
                opponentSelectsClue(row, col);
            }
        } else { // handle correct response   
            clearBuzzerTimeout();
            await readText(response.contestant);
            setMessageLines(response.contestant + ': What is ' + response.response + '?');
            setScores(prev => {
                const next = structuredClone(prev);
                next[response.contestant].score += scoreChange;
                next[response.contestant].categoryStats[col].correct += 1;
                next[response.contestant].categoryStats[col].timesSelected += 1;
                return next;
            });
            gameInfoContext.dispatch({
                type: 'set_last_correct_contestant',
                lastCorrect: response.contestant
            });
            setBoardState(row, col, 'closed');
            opponentSelectsClue(row, col);
        }
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
            opponentTimerRef.current = setTimeout(runStep, responseTime + 1000);
        };
        opponentTimerRef.current = setTimeout(runStep, responseTime);
    }

    function opponentAnswer(row, col) {
        let incorrectContestants = board[col][row].response.incorrect_contestants;
        let responses = [];
        for (let i = 0; i < incorrectContestants.length; i++) {
            if (!board[col][row].answered_contestants.includes(incorrectContestants[i])) {
                responses.push({
                    contestant: incorrectContestants[i],
                    response: board[col][row].response.incorrect_responses[i],
                    correct: false
                });
            }
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

    function opponentSelectsClue(row, col) {
        // go to next clue selected by opponent
        const clueNumber = board[col][row].number;
        updateAvailableClueNumbers(clueNumber);
        let nextClueInfo = getNextClueInfo(row, col);
        if (nextClueInfo && opponentControlsBoard()) {
            setTimeout(() => {
                setMessageLines(gameInfoContext.state.lastCorrect + ': ' + nextClueInfo.nextClue.category + ' for $' + nextClueInfo.nextClue.value);
            }, 2000);
            response.seconds = 0;
            setTimeout(() => displayNextClue(nextClueInfo.nextClueNumber), 4000);
        }
    }

    function startBuzzerTimeout(row, col, isPlayerAnswer = false) {
        let timeout = new Audio(Timeout);
        buzzerTimeoutRef.current = setTimeout(() => {
            updateAvailableClueNumbers(board[col][row].number);
            timeout.play();
            if (isPlayerAnswer) {
                deductScore(row, col);
            } else if (isTripleStumper(row, col)) {
                showAnswer(row, col);
                setBoardState(row, col, 'closed');
                if (opponentControlsBoard()) {
                    opponentSelectsClue(row, col);
                }
            }
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

    function getContestantAggressiveness(profile, playerScore, leaderScore) {
        let aggressiveness = 1.0;

        // Baseline from historical clue-selection style
        aggressiveness += (profile.bottomRowWeight - 2.0) * 0.15;
        aggressiveness += (profile.jumpCategoryWeight - 1.0) * 0.20;
        aggressiveness += (profile.dailyDoubleHuntWeight - 1.5) * 0.25;
        aggressiveness -= (profile.sameCategoryWeight - 2.0) * 0.08;

        // Live adjustment from current game state
        if (playerScore < leaderScore && leaderScore > 0) {
            const deficitRatio = (leaderScore - playerScore) / leaderScore;
            aggressiveness += Math.min(deficitRatio * 0.4, 0.25);
        } else if (playerScore > leaderScore) {
            aggressiveness -= 0.08;
        }

        return Math.max(0.75, Math.min(1.6, aggressiveness));
    }

    function getOverallAccuracy(contestant, currentScores) {
        const historicalAccuracy = showData.jeopardy_round_player_profiles[contestant].accuracy;
        const cluesSeen = getRoundProgress() * 30;
        const liveWeight = Math.min(cluesSeen / 15, 0.5); // cap live influence
        const historicalWeight = 1 - liveWeight;
        let correct = 0;
        let wrong = 0;

        for (let col = 0; col < currentScores[contestant].categoryStats.length; col++) {
            correct += currentScores[contestant].categoryStats[col].correct;
            wrong += currentScores[contestant].categoryStats[col].wrong;
        }

        if (correct + wrong === 0) {
            return historicalAccuracy;
        }
        const liveAccuracy = correct / (correct + wrong);

        return historicalWeight * historicalAccuracy + liveWeight * liveAccuracy;
    }

    function estimateCategoryConfidence(contestant, row, col) {
        let confidence = 0.5;
        const currentScores = scoresRef.current;
        const overallAccuracy = getOverallAccuracy(contestant, currentScores);

        // Overall contestant strength
        confidence += (overallAccuracy - 0.5) * 0.25;
        // Performance in this category so far
        confidence += (currentScores[contestant].categoryStats[col].correct - currentScores[contestant].categoryStats[col].wrong) * 0.08;
        // Preference for selecting this category
        confidence += Math.min(currentScores[contestant].categoryStats[col].timesSelected * 0.03, 0.09);
        // Difficulty penalty for deeper rows
        confidence -= row * 0.04;

        return Math.max(0.25, Math.min(0.85, confidence));
    }

    function estimateDailyDoubleAccuracy(contestant, row, col) {
        let baseAccuracy = 0.62;
        const categoryConfidence = estimateCategoryConfidence(contestant, row, col);

        // category familiarity/confidence
        baseAccuracy += (categoryConfidence - 0.5) * 0.2;

        // harder clues lower accuracy slightly
        baseAccuracy -= row * 0.03;

        return Math.max(0.2, Math.min(0.9, baseAccuracy));
    }

    function estimateDailyDoubleWager(score, leaderScore, clueValue, row, col) {
        const opponent = gameInfoContext.state.lastCorrect;
        const trailing = score < leaderScore;
        const confidence = estimateCategoryConfidence(opponent, row, col);
        const maxSafe = Math.max(1000, Math.floor(score * (0.25 + confidence * 0.25)));
        const profile = gameInfoContext.state.round === 1 ? showData.jeopardy_round_player_profiles[opponent] : showData.double_jeopardy_round_player_profiles[opponent];
        const aggressiveness = getContestantAggressiveness(profile, score, leaderScore);
        let wager = maxSafe;

        if (trailing) {
            wager *= 1.4;
        }

        wager *= aggressiveness;
        wager = Math.max(clueValue, Math.round(wager / 100) * 100);

        if (score < 1000) {
            wager = Math.max(wager, 1000);
        }

        return Math.max(0, wager);
    }

    function getOpponentDailyDoubleWager(clue, row, col) {
        const currentScores = scoresRef.current;
        const currentScore = currentScores[gameInfoContext.state.lastCorrect].score;
        const leaderScore = Math.max(...Object.values(currentScores).map(s => s.score));
        let simulatedWager = 0;
        // estimate daily double wager if this is not the same opponent who answered the daily double in the historical game 
        if (!gameInfoContext.state.lastCorrect || (clue.response.correct_contestant !== gameInfoContext.state.lastCorrect)) {
            simulatedWager = estimateDailyDoubleWager(currentScore, leaderScore, clue.value, row, col);
            if (simulatedWager > currentScore) {
                return Math.max(currentScore, 1000 * gameInfoContext.state.round);
            }
            return simulatedWager;
        }
        if (clue.daily_double_wager > currentScore) {
            if (currentScore > 1000 * gameInfoContext.state.round) {
                return currentScore;
            }
            return 1000 * gameInfoContext.state.round;
        }
        return clue.daily_double_wager;
    }

    function opponentControlsBoard() {
        return gameInfoContext.state.lastCorrect !== player.name;
    }

    function displayNextClue(nextClueNumber) {
        setResponseTimerIsActive(false);
        setMessageLines('');
        if (nextClueNumber) {
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

    function isSameCategory(a, b) {
        return a && b && a.col === b.col;
    }

    function isDirectlyBelow(previous, candidate) {
        return previous && candidate.col === previous.col && candidate.row === previous.row + 1;
    }

    function countRemainingInCategory(col) {
        let count = 0;
        for (let row = 0; row < 5; row++) {
            if (availableClueNumbers[board[col][row].number] - 1) count++;
        }
        return count;
    }

    function estimateDailyDoubleLikelihood(candidate) {
        // lower rows more likely than upper rows
        // row 4 highest, then row 3, etc.
        const baseByRow = gameInfoContext.state.round === 1
            ? [0.0, 0.4, 2.6, 4.1, 2.9]
            : [0.0, 1.1, 3.5, 3.7, 1.7];

        const revealedCols = gameInfoContext.state.revealedCols;
        if (revealedCols.includes(candidate.col) || revealedCols.length === 2) {
            return 0;
        }

        return baseByRow[candidate.row] || 0;
    }

    function getAggressionFactor(playerScore, leaderScore) {
        if (playerScore < leaderScore) return 1.3;
        if (playerScore > leaderScore) return 0.9;
        return 1.0;
    }

    function filterAvailableCluesForRealism(previousPick, profile) {
        const progress = getRoundProgress();
        const topDownTendency = getTopDownTendency(profile);
        let filtered = [];

        for (let col = 0; col < 6; col++) {
            for (let row = 0; row < 5; row++) {
                if (availableClueNumbers[board[col][row].number - 1]) {
                    filtered.push({ clueNumber: board[col][row].number, row: row, col: col });
                }
            }
        }
        // Early game: almost never allow jumps into row 0.
        if (progress < 0.5) {
            const noTopRowJumps = filtered.filter(clue => {
                if (clue.row !== 0) return true;
                if (!previousPick) return topDownTendency > 0.85;
                if (clue.col === previousPick.col) return true; // same category continuation
                return topDownTendency > 0.85; // only very top-down players may still do this
            });

            if (noTopRowJumps.length > 0) {
                filtered = noTopRowJumps;
            }
        }

        // Very early game: also discourage row 1 jumps for most players.
        if (progress < 0.25) {
            const noEarlyRowOneJumps = filtered.filter(clue => {
                if (clue.row > 1) return true;
                if (clue.row === 1) {
                    if (!previousPick) return topDownTendency > 0.75;
                    if (clue.col === previousPick.col) return true;
                    return topDownTendency > 0.75;
                }
                return true; // row 0 was already handled above
            });

            if (noEarlyRowOneJumps.length > 0) {
                filtered = noEarlyRowOneJumps;
            }
        }

        return filtered;
    }

    function scoreClueAdvanced({
        candidate,
        previousPick,
        profile,
        freqMatrix,
        transitions,
        playerScore,
        leaderScore
    }) {
        let styleScore = 1;
        const aggression = getAggressionFactor(playerScore, leaderScore);
        const progress = getRoundProgress(board);
        const rowMultiplier = getRowPhaseMultiplier(candidate.row, progress, profile);

        // Historical coordinate preference
        styleScore += (freqMatrix[candidate.row][candidate.col] || 0) * profile.historicalWeight;

        // Transition preference
        if (previousPick) {
            const fromKey = `${previousPick.row},${previousPick.col}`;
            const toKey = `${candidate.row},${candidate.col}`;
            const transitionCount = transitions[fromKey]?.[toKey] || 0;
            styleScore += transitionCount * profile.transitionWeight;
        }

        // Same category preference
        if (isSameCategory(previousPick, candidate)) {
            styleScore += profile.sameCategoryWeight;
        }

        // Continue downward in same category
        if (isDirectlyBelow(previousPick, candidate)) {
            styleScore += profile.continueDownWeight;
        }

        // Bottom-row / high-value preference
        styleScore += candidate.row * profile.bottomRowWeight * 0.6 * aggression;

        // Jumping categories
        if (previousPick && candidate.col !== previousPick.col) {
            styleScore += profile.jumpCategoryWeight;
        }

        // Daily Double hunting tendency
        styleScore += estimateDailyDoubleLikelihood(candidate, gameInfoContext.state.round) * profile.dailyDoubleHuntWeight * aggression;

        // Category-clearing tendency
        // If only a few clues remain in a category, some players like to finish it.
        const remainingInCategory = countRemainingInCategory(candidate.col);
        if (remainingInCategory <= 2) {
            styleScore += 1.2;
        }

        // top rows are rarely selected near the beginning of the game
        styleScore *= rowMultiplier;

        // Real contestants almost never jump into the top row early.
        if (
            previousPick &&
            progress < 0.5 &&
            candidate.row === 0 &&
            candidate.col !== previousPick.col
        ) {
            const topDownTendency = getTopDownTendency(profile);
            const penalty = 0.08 + topDownTendency * 0.22;
            styleScore *= penalty;
        }

        // Small randomness so ties don't feel robotic
        styleScore += Math.random() * profile.randomness;

        // Recovery scoring using the next few historical targets
        const historicalTargets = getHistoricalTargets();
        const historyWeight = Math.max(0.35, 0.85 - gameInfoContext.state.divergence * 0.15);
        const styleWeight = 1 - historyWeight;

        const historicalScore =
            historicalTargets.length > 0
                ? scoreHistoricalRecovery(candidate, historicalTargets, previousPick)
                : 0;

        const finalScore =
            historicalTargets.length > 0
                ? historyWeight * historicalScore + styleWeight * styleScore
                : styleScore;

        return Math.max(finalScore, 0.01);
    }

    function scoreHistoricalRecovery(candidate, historicalTargets, previousPick) {
        // score candidates against all historical targets, weighted by recency
        const weights = [1.0, 0.6, 0.35];
        let total = 0;

        for (let i = 0; i < historicalTargets.length; i++) {
            const target = gameInfoContext.state.round === 1 ? showData.jeopardy_clue_number_to_coordinates[historicalTargets[i]] : showData.double_jeopardy_clue_number_to_coordinates[historicalTargets[i]];
            total += weights[i] * scoreCandidateAgainstHistoricalTarget(
                candidate,
                target,
                previousPick
            );
        }

        return total;
    }

    function scoreCandidateAgainstHistoricalTarget(candidate, target, previousPick) {
        // score how close a candidate clue is to the intended historical path
        let score = 0;

        // Strong preference: same category as historical target
        if (candidate.col === target.col) {
            score += 10;
        }

        // Prefer similar row to the historical target
        score += Math.max(0, 5 - Math.abs(candidate.row - target.row));

        // Preserve current board flow
        if (previousPick && candidate.col === previousPick.col) {
            score += 3;
        }

        // If candidate continues directly downward from previous pick
        if (
            previousPick &&
            candidate.col === previousPick.col &&
            candidate.row === previousPick.row + 1
        ) {
            score += 2;
        }

        return score;
    }

    function getBestChoice(options) {
        let best = options[0];

        for (const option of options) {
            if (option.score > best.score) {
                best = option;
            }
        }

        return best.clue;
    }

    function updateDivergence(actualClueNumber) {
        const divergence = gameInfoContext.state.divergence;

        // If the actual clue matches the expected historical clue, then the game is back on script and we reduce divergence slightly.
        if (actualClueNumber === getNextHistoricalClueNumber()) {
            gameInfoContext.dispatch({ type: 'update_divergence', divergence: Math.max(0, divergence - 1) });
            return;
        }

        // If the actual clue matches one of the next few historical targets, small divergence.
        const historicalTargets = getHistoricalTargets();
        if (historicalTargets.includes(actualClueNumber)) {
            gameInfoContext.dispatch({ type: 'update_divergence', divergence: divergence + 1 });
            return;
        }

        // If the clue does not match the expected one or the next few, we assume the board has diverged significantly
        gameInfoContext.dispatch({ type: 'update_divergence', divergence: divergence + 2 });
        return;
    }

    function getHistoricalTargets(count = 3) {
        const targets = [];
        for (let clueNumber = 1; clueNumber < availableClueNumbers.length; clueNumber++) {
            if (availableClueNumbers[clueNumber - 1]) {
                targets.push(clueNumber);
            }
            if (targets.length === count) {
                break;
            }
        }
        return targets;
    }

    function chooseClueAdvanced(
        previousPick
    ) {
        const opponent = gameInfoContext.state.lastCorrect;
        const profile = gameInfoContext.state.round === 1 ? showData.jeopardy_round_player_profiles[opponent] : showData.double_jeopardy_round_player_profiles[opponent];
        const freqMatrix = gameInfoContext.state.round === 1 ? showData.jeopardy_round_frequency_matrix[opponent] : showData.double_jeopardy_round_frequency_matrix[opponent];
        const transitions = gameInfoContext.state.round === 1 ? showData.jeopardy_round_transition_matrix[opponent] : showData.double_jeopardy_round_transition_matrix[opponent];
        const leaderScore = Math.max(...Object.values(scores).map(s => s.score));
        const playerScore = scores[opponent].score;
        const realisticClueNumbers = filterAvailableCluesForRealism(previousPick, profile).map(clue => clue.clueNumber);
        const scoredOptions = [];

        for (let clueNumber of realisticClueNumbers) {
            const candidate = gameInfoContext.state.round === 1 ? showData.jeopardy_clue_number_to_coordinates[clueNumber] : showData.double_jeopardy_clue_number_to_coordinates[clueNumber];
            if (candidate) {
                scoredOptions.push({
                    clue: clueNumber,
                    score: scoreClueAdvanced({
                        candidate,
                        previousPick,
                        profile,
                        freqMatrix,
                        transitions,
                        playerScore,
                        leaderScore
                    })
                });
            }

        }

        if (scoredOptions.length === 0) {
            return null;
        }
        return getBestChoice(scoredOptions);
    }

    function updateAvailableClueNumbers(clueNumber) {
        availableClueNumbers[clueNumber - 1] = false;
    }

    function getRoundProgress() {
        let taken = 0;
        for (let clueNumber of availableClueNumbers) {
            if (!clueNumber) {
                taken++;
            }
        }
        return taken / 30;
    }

    function getRowPhaseMultiplier(row, progress, profile) {
        let multiplier;
        // base modern strategy
        if (progress < 0.33) {
            const early = [0.05, 0.25, 0.8, 1.2, 1.5];
            multiplier = early[row] ?? 1;
        } else if (progress < 0.66) {
            const mid = [0.2, 0.7, 1.0, 1.2, 1.3];
            multiplier = mid[row] ?? 1;
        } else {
            const late = [0.8, 1.0, 1.0, 1.1, 1.1];
            multiplier = late[row] ?? 1;
        }

        const topDownTendency = getTopDownTendency(profile);
        // soften modern bias for top-down contestants
        if (progress < 0.66) {
            if (row === 0) {
                multiplier *= 1 + topDownTendency * 8;
            }
            if (row === 1) {
                multiplier *= 1 + topDownTendency * 3;
            }
            if (row === 4) {
                multiplier *= 1 - topDownTendency * 0.35;
            }
        }

        return multiplier;
    }

    function getTopDownTendency(profile) {
        // bottomRowWeight ranges roughly from 1 → 4
        const bottomSeeking = Math.max(
            0,
            Math.min((profile.bottomRowWeight - 1) / 3, 1)
        );
        // continueDownWeight ranges roughly from 1 → 5
        const downwardPreference = Math.max(
            0,
            Math.min((profile.continueDownWeight - 1) / 4, 1)
        );
        const topRowPreference = 1 - bottomSeeking;
        return 0.5 * topRowPreference + 0.5 * downwardPreference;
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
        stats.numClues += 1;
        let clue;
        if (gameInfoContext.state.round <= 1) {
            clue = showData.jeopardy_round[col][row];
        } else if (gameInfoContext.state.round === 2 || gameInfoContext.state.round === 1.5) {
            clue = showData.double_jeopardy_round[col][row];
        }
        updateDivergence(clue.number);
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
                opponentAnswer(row, col);
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
        updateAvailableClueNumbers(board[col][row].number);
        setBoardState(row, col, 'closed');
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

        if (!isPlayerDailyDouble(row, col)) {
            startBuzzerTimeout(row, col);
            opponentAnswer(row, col);
            resetClue(row, col);
        } else {
            setBoardState(row, col, 'closed');
        }
    }

    function resetClue(row, col) {
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
                                        <button className='answer-button buzzer-button' onClick={() => playerAnswer(row, column)} disabled={disableClue}><HiHandRaised /></button>
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