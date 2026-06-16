const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreElement = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');
const pauseBtn = document.getElementById('pause-btn');
const leaderboardList = document.getElementById('leaderboard-list');

// Prefill player name from previous input if available
const savedName = localStorage.getItem('playerName');

let isPaused = false;

// Game constants
const LANES = 6;
const LANE_WIDTH = canvas.width / LANES;
const CAR_WIDTH = LANE_WIDTH -30;
const CAR_HEIGHT = CAR_WIDTH * 1.75;
const OBSTACLE_COLORS = ['#FFD700', '#3498db', '#e74c3c', '#2ecc71', '#e67e22'];

// Game variables
let gameLoop;
let isGameOver = false;
let score = 0;
let speed = 5;
let frameCount = 0;
let obstacles = [];

let lastTime = 0;
let roadOffset = 0;
let spawnTimer = 0;
const TRUCK_SPAWN_CHANCE = 0.2;

class Obstacle {
    constructor(x, y, width, height, color) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
    }

    update(speed, dt) {
        this.y += 1.5 * speed * dt;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);

        ctx.fillStyle = '#FFFFAA';
        ctx.fillRect(this.x + 2, this.y + this.height - 6, 8, 6);
        ctx.fillRect(this.x + this.width - 10, this.y + this.height - 6, 8, 6);

        ctx.fillStyle = '#CC0000';
        ctx.fillRect(this.x + 2, this.y, 8, 4);
        ctx.fillRect(this.x + this.width - 10, this.y, 8, 4);
    }

    collidesWith(player) {
        return player.x < this.x + this.width &&
               player.x + CAR_WIDTH > this.x &&
               player.y < this.y + this.height &&
               player.y + CAR_HEIGHT > this.y;
    }

    isOffScreen(canvasHeight) {
        return this.y > canvasHeight;
    }
}

class TruckObstacle extends Obstacle {
    constructor(x, y, width, height, color) {
        super(x, y, width, height, color);
        this.cabHeight = height * 0.70; // Tırın ön kupası daha küçük olur (örn: %30)
        this.trailerHeight = height - this.cabHeight;
    }

    draw() {
        // 1. ÖN KABİN
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.cabHeight);

        // 2. ARKA DORSE
        ctx.fillStyle = this.color; 
        ctx.fillRect(this.x, this.y + this.cabHeight + 4, this.width, this.trailerHeight - 4);

        // front lights
        ctx.fillStyle = '#FFFFAA';
        ctx.fillRect(this.x + 2, this.y + this.height - 6, 8, 6);
        ctx.fillRect(this.x + this.width - 10, this.y + this.height - 6, 8, 6);

        // back lights
        ctx.fillStyle = '#CC0000';
        ctx.fillRect(this.x + 2, this.y, 8, 4);
        ctx.fillRect(this.x + this.width - 10, this.y, 8, 4);
    }
}

// Player object (delay and tilt variables added)
const player = {
    x: canvas.width / 2,       // Real-time current X position of the car
    targetX: canvas.width / 2,
    y: canvas.height - CAR_HEIGHT - 20,
    angle: 0,                        // Real-time rotation angle of the car (radians)
    
    update: function(dt) {
        // DELAYED CONTROL (LERP logic)
        // Calculate the difference between target and current position
        const diffX = this.targetX - this.x;
        
        // Move toward the target by 12% of the difference each frame (reduce 0.12 to increase lag)
        // Multiply by dt so movement stays stable independent of refresh rate (60fps/120fps)
        this.x += diffX * 0.12 * dt;

        // TILT EFFECT
        // The farther the car is from the target, the faster it should turn, so it tilts more.
        // If diffX is positive it tilts right, negative tilts left. Multiply by 0.003 to cap the maximum tilt.
        const targetAngle = diffX * 0.003;
        
        // Apply a small lerp to smooth angle changes as well
        this.angle += (targetAngle - this.angle) * 0.2 * dt;
    },
    
    draw: function() {
        ctx.save();
        
        const centerX = this.x + CAR_WIDTH / 2;
        const centerY = this.y + CAR_HEIGHT;
        
        ctx.translate(centerX, centerY);
        ctx.rotate(this.angle);
        
        // 1. Main body (gray)
        ctx.fillStyle = '#808080';
        ctx.fillRect(-CAR_WIDTH / 2, -CAR_HEIGHT, CAR_WIDTH, CAR_HEIGHT);
        
        // 2. FRONT HEADLIGHTS (light yellow/white - top corners)
        ctx.fillStyle = '#FFFFAA';
        // Left front light (width: 8px, height: 6px)
        ctx.fillRect(-CAR_WIDTH / 2 + 2, -CAR_HEIGHT, 8, 6);
        // Right front light
        ctx.fillRect(CAR_WIDTH / 2 - 10, -CAR_HEIGHT, 8, 6);

        // 3. REAR TAILLIGHTS (dark red - bottom corners)
        ctx.fillStyle = '#FF0000';
        // Left rear light (width: 8px, height: 4px)
        ctx.fillRect(-CAR_WIDTH / 2 + 2, -4, 8, 4);
        // Right rear light
        ctx.fillRect(CAR_WIDTH / 2 - 10, -4, 8, 4);
        
        ctx.restore();
    }
};

// --- NEW TOUCH AND MOUSE CONTROLS ---
let isDragging = false;

// Helper function to calculate target X from mouse or touch coordinate
function updateTargetX(clientX) {
    // Get canvas left corner position on the screen (for responsive support)
    const rect = canvas.getBoundingClientRect();
    
    // Relative X coordinate of the clicked/touched point inside the canvas
    const canvasX = clientX - rect.left;
    
    // Align the car center to the mouse/finger
    let newTargetX = canvasX - CAR_WIDTH / 2;
    
    // Prevent the car from moving off the left or right edge of the screen (clamping)
    if (newTargetX < 0) newTargetX = 0;
    if (newTargetX > canvas.width - CAR_WIDTH) newTargetX = canvas.width - CAR_WIDTH;
    
    player.targetX = newTargetX;
}

// MOUSE (DESKTOP) EVENTS
canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    updateTargetX(e.clientX);
});

window.addEventListener('mousemove', (e) => {
    if (isDragging) {
        updateTargetX(e.clientX);
    }
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

// TOUCH (MOBILE DEVICE) EVENTS
canvas.addEventListener('touchstart', (e) => {
    isDragging = true;
    // First touch point on mobile: e.touches[0]
    updateTargetX(e.touches[0].clientX);
});

window.addEventListener('touchmove', (e) => {
    if (isDragging) {
        // Prevent page scrolling up/down so the game plays smoothly
        e.preventDefault(); 
        updateTargetX(e.touches[0].clientX);
    }
}, { passive: false }); // required for preventDefault to work on mobile

window.addEventListener('touchend', () => {
    isDragging = false;
});


function spawnObstacle() {
    // select random lane
    const randomLane = Math.floor(Math.random() * LANES);
    const laneX = (randomLane * LANE_WIDTH) + (LANE_WIDTH / 2) - (CAR_WIDTH / 2);
    
    // decide if the vehicle is automobile or truck
    const isTruck = Math.random() < TRUCK_SPAWN_CHANCE;
    const obstacleHeight = isTruck ? CAR_HEIGHT * 2 : CAR_HEIGHT;
    const spawnY = -obstacleHeight;

    // --- Secure follow distance control ---
    const MIN_DISTANCE = CAR_HEIGHT; 

    const isLaneOccupied = obstacles.some(obs => {
        return obs.x === laneX && obs.y < MIN_DISTANCE;
    });

    if (isLaneOccupied) {
        return;
    }

    const randomColor = OBSTACLE_COLORS[Math.floor(Math.random() * OBSTACLE_COLORS.length)];

    const obstacle = isTruck
        ? new TruckObstacle(laneX, spawnY, CAR_WIDTH, obstacleHeight, randomColor)
        : new Obstacle(laneX, spawnY, CAR_WIDTH, obstacleHeight, randomColor);

    obstacles.push(obstacle);
}

// Main game loop
function update(time) {
    if (isGameOver || isPaused) return;

    if (!lastTime) lastTime = time;
    const deltaTime = time - lastTime;
    lastTime = time;
    const dt = deltaTime / (1000 / 60); 

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Road lines
    roadOffset -= speed * dt;
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 20]);
    for (let i = 1; i < LANES; i++) {
        ctx.beginPath();
        ctx.moveTo(i * LANE_WIDTH, - (roadOffset % 40)); 
        ctx.lineTo(i * LANE_WIDTH, canvas.height);
        ctx.stroke();
    }
    ctx.setLineDash([]); 

    // Update and draw the player physics
    player.update(dt);
    player.draw();

    // Update and draw obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.update(speed, dt);
        obs.draw();

        if (obs.collidesWith(player)) {
            endGame();
        }

        if (obs.isOffScreen(canvas.height)) {
            obstacles.splice(i, 1);
            score += 10;
            scoreElement.innerText = score;
            if (score % 100 === 0) speed += 0.5;
        }
    }

    // Spawn logic (including randomness)
    const baseSpawnRate = Math.max(12, 45 - Math.floor(speed * 3));
    const randomFactor = Math.random() * 1.2 + 0.4;
    const currentSpawnRate = baseSpawnRate * randomFactor;

    spawnTimer += dt;
    if (spawnTimer >= currentSpawnRate) {
        spawnObstacle();
        spawnTimer = 0;
    }

    gameLoop = requestAnimationFrame(update);
}

function togglePause() {
    if (isGameOver) return;

    isPaused = !isPaused;
    pauseBtn.innerText = isPaused ? 'Devam Et' : 'Durdur';

    if (!isPaused) {
        lastTime = 0; 
        gameLoop = requestAnimationFrame(update);
    } else {
        cancelAnimationFrame(gameLoop);
    }
}

async function endGame() {
    console.log("Game finished.");
    isGameOver = true;
    cancelAnimationFrame(gameLoop);
    const response = await fetch('/api/save_score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 'name': savedName, 'score': score })
    });
    console.log(response.status)
    pauseBtn.style.display = 'none';
    finalScoreElement.innerText = score;
    gameOverScreen.classList.remove('hidden');
    fetchLeaderboard();
}

function resetGame() {
    obstacles = [];
    score = 0;
    speed = 5;
    lastTime = 0;
    roadOffset = 0;
    spawnTimer = 0;
    isPaused = false;
    pauseBtn.style.display = 'block';
    pauseBtn.innerText = 'Durdur';
    scoreElement.innerText = score;
    
    // New behavior: set the car's initial target to the exact center of the canvas
    const startX = canvas.width / 2 - CAR_WIDTH / 2;
    player.x = startX;
    player.targetX = startX; 
    player.angle = 0;     
    
    isGameOver = false;
    gameOverScreen.classList.add('hidden');
    requestAnimationFrame(update); 
}

function fetchLeaderboard() {
    fetch('/api/get_scores')
        .then(res => res.json())
        .then(data => {
            leaderboardList.innerHTML = '';
            data.forEach((entry, index) => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${index + 1}. ${entry.name}</span> <span>${entry.score}</span>`;
                leaderboardList.appendChild(li);
            });
        });
}

restartBtn.addEventListener('click', resetGame);
pauseBtn.addEventListener('click', togglePause);
requestAnimationFrame(update);
