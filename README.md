# Trivia Trainer

A trivia training application inspired by board-based quiz gameplay, focused on skill development and performance tracking.
The app allows users to play against simulated AI opponents, complete with buzzing, scoring, and real-time game state updates.

# Overview

The application works as a full-stack system:  
-The frontend calls a backend Flask API.  
-Game data is returned as structured JSON.  
-The React app renders the game and handles all gameplay logic.  

# Architecture
React Frontend  →  Flask API  →  Database

Frontend (this repo):  
-Game UI  
-AI opponents  
-Buzzing logic  
-Scoring system  
-Game state management

Backend (separate repo):  
-Data normalisation  
-JSON API

# Running Locally
npm install  
npm start  
Make sure the backend API is also running locally before starting the frontend.

