import React, { useState, useEffect, useContext } from 'react';
import Timeout from '../resources/timeout.mp3';
import { PlayerContext, ScoreContext, StartTimerContext } from '../App';

function Podium() {
    const contestants = useContext(ScoreContext);
    const startTimer = useContext(StartTimerContext);
    const playerName = useContext(PlayerContext);
    const names = Object.keys(contestants);
    let [ticks, setTicks] = useState(new Array(9).fill(true));
    const ticksList = ticks.map((_tick, index) =>
        <span key={'tick' + index} className='tick'></span>);

    // 5 second countdown to respond after player's name is called
    useEffect(() => {
        let responseCountdownInterval = {};
        if (startTimer) {
            let timeout = new Audio(Timeout);
            let responseCountdown = 4;
            responseCountdownInterval = setInterval(() => {
                if (responseCountdown === 0) {
                    timeout.play();
                } else {
                    setTicks(new Array(responseCountdown * 2 - 1).fill(true));
                }
                responseCountdown -= 1;
            }, 1000);
        } else {
            setTicks(new Array(9).fill(true));
        }
        return () => {
            clearInterval(responseCountdownInterval);
        }
    }, [startTimer]);

    function isActivePlayerPodium(name) {
        return name === playerName && startTimer;
    }

    return (
        <div id='podiums'>
            {names.map(name => {
                return contestants[name] &&
                    <div className='podium' key={name}>
                        {isActivePlayerPodium(name) ? <div className='tick-row'>{ticksList}</div> : <div className='tick-row'></div>}
                        <div className='podium-row'>${contestants[name].score}</div>
                        <div className='podium-row name-row'>{name}</div>
                        <div className='big-podium-row'>{contestants[name].response}</div>
                        {contestants[name].response && <div className='podium-row'>${contestants[name].wager}</div>}
                    </div>
            })}
        </div>
    );
}

export default Podium;