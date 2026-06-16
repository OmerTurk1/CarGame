const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreElement = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');
const saveBtn = document.getElementById('save-btn');
const playerNameInput = document.getElementById('player-name');
const leaderboardList = document.getElementById('leaderboard-list');

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
    const randomLane = Math.floor(Math.random() * LANES);
    const laneX = (randomLane * LANE_WIDTH) + (LANE_WIDTH / 2) - (CAR_WIDTH / 2);
    const randomColor = OBSTACLE_COLORS[Math.floor(Math.random() * OBSTACLE_COLORS.length)];
    
    obstacles.push({
        x: laneX,
        y: -CAR_HEIGHT,
        width: CAR_WIDTH,
        height: CAR_HEIGHT,
        color: randomColor
    });
}

// Main game loop
function update(time) {
    if (isGameOver) return;

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
        obs.y += 1.5 * speed * dt; 

        // 1. Bot main body drawing
        ctx.fillStyle = obs.color; 
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

        // 2. BOT FRONT HEADLIGHTS (As they move down, the headlights should be at the bottom)
        ctx.fillStyle = '#FFFFAA';
        // Left front light
        ctx.fillRect(obs.x + 2, obs.y + obs.height - 6, 8, 6);
        // Right front light
        ctx.fillRect(obs.x + obs.width - 10, obs.y + obs.height - 6, 8, 6);

        // 3. BOT REAR TAILLIGHTS (The taillights should be at the top)
        ctx.fillStyle = '#CC0000';
        // Left rear light
        ctx.fillRect(obs.x + 2, obs.y, 8, 4);
        // Right rear light
        ctx.fillRect(obs.x + obs.width - 10, obs.y, 8, 4);

        // GEOMETRIC COLLISION TEST (AABB)
        if (player.x < obs.x + obs.width &&
            player.x + CAR_WIDTH > obs.x &&
            player.y < obs.y + obs.height &&
            player.y + CAR_HEIGHT > obs.y) {
            endGame();
        }

        if (obs.y > canvas.height) {
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

function endGame() {
    isGameOver = true;
    cancelAnimationFrame(gameLoop);
    finalScoreElement.innerText = score;
    gameOverScreen.classList.remove('hidden');
    saveBtn.disabled = false;
    saveBtn.innerText = "Skoru Kaydet";
    fetchLeaderboard();
}

function resetGame() {
    obstacles = [];
    score = 0;
    speed = 5;
    lastTime = 0;
    roadOffset = 0;
    spawnTimer = 0;
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


restartBtn.addEventListener('click', resetGame);

saveBtn.addEventListener('click', () => {
    const name = playerNameInput.value || 'Anonim';
    fetch('/api/save_score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, score: score })
    }).then(() => {
        saveBtn.disabled = true;
        saveBtn.innerText = "Kaydedildi!";
        fetchLeaderboard();
    });
});

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

requestAnimationFrame(update);
