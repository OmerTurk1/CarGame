# Infinite Race - Car Game

A web-based endless runner game built with Flask and Canvas. Players control a car to avoid obstacles (cars and trucks), earn points, and compete on a leaderboard. The game features two vehicle types, pause/resume controls, and automatic score saving.

## Features

- Control your car by clicking/tapping to avoid incoming traffic
- Two obstacle types: regular cars and longer trucks
- Pause and resume during gameplay
- Automatic score saving on game over
- Top 5 leaderboard display
- Player name persistence via localStorage
- Progressive difficulty: speed increases every 100 points

## Project Structure

- `app.py` - Flask backend server, handles score API endpoints
- `templates/index.html` - Game start page with name input
- `templates/game.html` - Game canvas and UI layer
- `static/js/game_new.js` - Core game logic, rendering, controls, object classes
- `static/css/style.css` - Styling for game container and UI elements
- `data/scores.json` - JSON file storing player names and their top scores

## File Descriptions

### app.py (Flask Backend)
Serves HTML pages and manages score persistence:
- GET `/` - Renders the start page
- GET `/game` - Renders the game page
- POST `/start_game` - Handles game start request
- GET `/api/get_scores` - Returns top 5 scores from scores.json
- POST `/api/save_score` - Saves or updates player score
- Configurable: host, port, debug mode, leaderboard size, data file path

### static/js/game_new.js (Game Engine)
Main game loop, physics, rendering, and event handling:
- Obstacle class: base class for cars with update, draw, collision, and off-screen checks
- TruckObstacle class: extends Obstacle with two-part truck drawing (cab + trailer)
- Player object: handles car movement, tilt effect, delayed input response
- Game update loop: processes collisions, spawns obstacles, updates score
- Input handling: mouse and touch events for responsive controls
- Auto-save on game end and leaderboard fetch

### templates/game.html (Game UI)
Canvas element and game overlay:
- Canvas: 400x700px game rendering surface
- UI layer: score display, pause button, game-over screen, leaderboard
- Game-over screen: player name input, restart button, auto-filled from localStorage

### templates/index.html (Start Page)
Entry point with player setup:
- Name input field (saved to localStorage)
- Start button triggers game redirect

### static/css/style.css (Styling)
Game container and UI styling:
- Game container: 400x700px centered box with dark theme
- Buttons, leaderboard formatting, pause button positioning

## Developer-Configurable Parameters

### Game Physics & Difficulty (static/js/game_new.js)

- `LANES` (default: 6) - Number of road lanes
- `CAR_WIDTH` (default: LANE_WIDTH - 30) - Width of cars and trucks in pixels
- `CAR_HEIGHT` (default: CAR_WIDTH * 1.75) - Height of regular cars
- `OBSTACLE_COLORS` (default: 5 colors) - Array of hex colors for vehicle painting
- Initial speed: `speed = 5` - Starting obstacle movement speed
- Speed increase: `if (score % 100 === 0) speed += 0.5` - Speed boost every 100 points

### Player Controls (static/js/game_new.js)

- `0.12` in update() - Player movement lerp factor (smoothness of following cursor)
- `0.003` in update() - Tilt/rotation responsiveness multiplier
- `0.2` in update() - Angle lerp factor (smooth rotation transitions)

### Obstacle Spawning (static/js/game_new.js)

- `TRUCK_SPAWN_CHANCE = 0.2` - Probability of spawning truck instead of car (20%)
- `baseSpawnRate` formula: `Math.max(12, 45 - Math.floor(speed * 3))` - Base spawn interval in frames
- `randomFactor` formula: `Math.random() * 1.2 + 0.4` - Random variation (40% to 160% of base)
- `1.5` multiplier - Obstacle movement speed relative to game speed

### Truck Shape (static/js/game_new.js)

- `this.cabHeight = height * 0.45` - Cab portion of truck (45% of total truck height)
- `this.trailerHeight = height - this.cabHeight` - Trailer portion (remaining height)

### UI & Canvas (static/css/style.css, templates/game.html)

- Canvas dimensions: `400x700` pixels
- Game container: `400x700` pixels
- Top leaderboard entries: `5` scores returned by API

### Backend (app.py)

- `host='0.0.0.0'` - Server host (accessible from any network interface)
- `port=5000` - Server port
- `debug=True` - Flask debug mode (auto-reload on code changes)
- `DATA_FILE = 'data/scores.json'` - Path to persistent scores file
- Leaderboard size: `[:5]` - Top 5 scores in response

## Running the Game

1. Install Flask:
   ```
   pip install flask
   ```

2. Start the server:
   ```
   python app.py
   ```

3. Open browser to http://localhost:5000

4. Enter your name and click "Oyuna Başla" (Start Game)

5. Click/tap on the game area to control your car and avoid obstacles

