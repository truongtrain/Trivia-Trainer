# Jeopardy React

A React web application that simulates real Jeopardy gameplay using authentic historical game data.
The app allows users to play full Jeopardy games against simulated AI opponents, complete with buzzing, scoring, and real-time game state updates.

# Overview

The application works as a full-stack system:
The frontend requests a gameId.
It calls a backend Flask API.
The API scrapes the corresponding game from the Jeopardy archives.
Game data is returned as structured JSON.
The React app renders the game and handles all gameplay logic.
This design allows the app to dynamically load and play real Jeopardy games on demand.

# Architecture
React Frontend  →  Flask API  →  Jeopardy Archives

Frontend (this repo):
Game UI
AI opponents
Buzzing logic
Scoring system
Game state management

Backend (separate repo):
Web scraping
Data normalisation
JSON API

# Tech Stack

Frontend:
React
JavaScript
CSS

Backend:
Python
Flask
Web scraping (BeautifulSoup / Requests)

# Related Repository

This frontend consumes data from the backend API: https://github.com/yourusername/jeopardy-flask-api

# Running Locally
npm install
npm start
Make sure the backend API is also running locally before starting the frontend.

