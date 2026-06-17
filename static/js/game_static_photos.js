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

// --- ARAÇ ASSET LİSTESİ ---
truck_aspect = 4.0
car_aspect = 1.8
const VEHICLE_ASSETS = [
    { src: '/static/assets/blue_car.png', aspect: car_aspect },
    { src: '/static/assets/green_car.png', aspect: car_aspect },
    { src: '/static/assets/orange_car.png', aspect: car_aspect },
    { src: '/static/assets/pink_car.png', aspect: car_aspect },
    { src: '/static/assets/red_car.png', aspect: car_aspect },
    { src: '/static/assets/turquaz_car.png', aspect: car_aspect },
    { src: '/static/assets/truck.png', aspect: truck_aspect },
    { src: '/static/assets/yellow_truck.png', aspect: truck_aspect },
    { src: '/static/assets/gray_truck.png', aspect: truck_aspect },
];

// Ana oyuncu aracı görseli ve dinamik boyutları
const playerCarImage = new Image();
playerCarImage.src = '/static/assets/car.png';

// Bot araçların Image nesnelerini tutacağımız dizi
const vehicleImages = [];
let imagesLoaded = false;

// Dinamik görsel ön yükleme fonksiyonu
function preloadImages() {
    const playerPromise = new Promise((resolve) => {
        playerCarImage.onload = () => {
            player.width = LANE_WIDTH - 30;
            player.height = player.width * car_aspect; // Oyuncu arabası default aspect
            player.y = canvas.height - player.height - 20;
            resolve();
        };
        playerCarImage.onerror = resolve;
    });

    const botPromises = VEHICLE_ASSETS.map((asset, index) => {
        const img = new Image();
        return new Promise((resolve) => {
            img.onload = () => {
                vehicleImages[index] = {
                    element: img,
                    aspect: asset.aspect
                };
                resolve();
            };
            img.onerror = resolve;
            img.src = asset.src;
        });
    });

    return Promise.all([playerPromise, ...botPromises]).then(() => {
        imagesLoaded = true;
    });
}

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

// --- GÜNCELLENEN OBSTACLE SINIFI (DİNAMİK ÇARPIŞMA) ---
class Obstacle {
    constructor(x, y, width, height, vehicleConfig) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.vehicle = vehicleConfig;
    }

    update(speed, dt) {
        this.y += 1.5 * speed * dt;
    }

    draw() {
        if (imagesLoaded && this.vehicle && this.vehicle.element.complete) {
            ctx.drawImage(this.vehicle.element, this.x, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = '#888';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }

    // Tamamen iki kutunun (görüntünün) sınırlarına göre çakışma kontrolü
    collidesWith(player) {
        return this.x < player.x + player.width &&
               this.x + this.width > player.x &&
               this.y < player.y + player.height &&
               this.y + this.height > player.y;
    }

    isOffScreen(canvasHeight) {
        return this.y > canvasHeight;
    }
}

// Player object
const player = {
    x: canvas.width / 2,       
    targetX: canvas.width / 2,
    y: 0,       // Preload aşamasında dinamik hesaplanacak
    width: 0,   // Preload aşamasında dinamik hesaplanacak
    height: 0,  // Preload aşamasında dinamik hesaplanacak
    angle: 0,                        
    
    update: function(dt) {
        // DELAYED CONTROL (LERP)
        const diffX = this.targetX - this.x;
        this.x += diffX * 0.12 * dt;

        // TILT EFFECT
        const targetAngle = diffX * 0.003;
        this.angle += (targetAngle - this.angle) * 0.2 * dt;
    },
    
    draw: function() {
        ctx.save();
        
        // Pivot Noktası: Aracın kendi dinamik arka orta noktası
        const pivotX = this.x + this.width / 2;
        const pivotY = this.y + this.height; 
        
        ctx.translate(pivotX, pivotY);
        ctx.rotate(this.angle + Math.PI);

        if (playerCarImage.complete) {
            ctx.drawImage(
                playerCarImage, 
                -this.width / 2, 
                0, 
                this.width, 
                this.height
            );
        } else {
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(-this.width / 2, 0, this.width, this.height);
        }
        
        ctx.restore();
    }
};

// --- TOUCH AND MOUSE CONTROLS ---
let isDragging = false;

function updateTargetX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const canvasX = clientX - rect.left;
    let newTargetX = canvasX - player.width / 2;
    
    if (newTargetX < 0) newTargetX = 0;
    if (newTargetX > canvas.width - player.width) newTargetX = canvas.width - player.width;
    
    player.targetX = newTargetX;
}

// MOUSE EVENTS
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

// TOUCH EVENTS
canvas.addEventListener('touchstart', (e) => {
    isDragging = true;
    updateTargetX(e.touches[0].clientX);
});

window.addEventListener('touchmove', (e) => {
    if (isDragging) {
        e.preventDefault(); 
        updateTargetX(e.touches[0].clientX);
    }
}, { passive: false });

window.addEventListener('touchend', () => {
    isDragging = false;
});

// --- SPAWN MANTIĞI ---
function spawnObstacle() {
    if (!imagesLoaded || vehicleImages.length === 0) return;

    const botWidth = LANE_WIDTH - 30; // Şerit genişliğine göre araç eni

    const randomLane = Math.floor(Math.random() * LANES);
    const laneX = (randomLane * LANE_WIDTH) + (LANE_WIDTH / 2) - (botWidth / 2);
    
    const randomVehicle = vehicleImages[Math.floor(Math.random() * vehicleImages.length)];
    
    // Yükseklik tamamen aracın kendi aspect ratio'suna bağlı
    const obstacleHeight = botWidth * randomVehicle.aspect;
    const spawnY = -obstacleHeight;

    // Şeritteki güvenli takip mesafesi de dinamik olarak bu aracın boyuna göre ayarlanıyor
    const MIN_DISTANCE = obstacleHeight + 40; 

    const isLaneOccupied = obstacles.some(obs => {
        return obs.x === laneX && obs.y < MIN_DISTANCE;
    });

    if (isLaneOccupied) {
        return;
    }

    const obstacle = new Obstacle(laneX, spawnY, botWidth, obstacleHeight, randomVehicle);
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

    // Update and draw the player
    player.update(dt);
    player.draw();

    // Update and draw obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.update(speed, dt);
        obs.draw();

        // Yeni dinamik bounding-box çarpışma testi
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

    // Spawn logic
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
    isGameOver = true;
    cancelAnimationFrame(gameLoop);
    
    try {
        await fetch('/api/save_score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 'name': savedName, 'score': score })
        });
    } catch (e) {
        console.error("Skor kaydedilemedi:", e);
    }
    
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
    
    const startX = canvas.width / 2 - player.width / 2;
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
        })
        .catch(err => console.error("Liderlik tablosu alınamadı:", err));
}

restartBtn.addEventListener('click', resetGame);
pauseBtn.addEventListener('click', togglePause);

// Her şeyi yükle ve oyunu başlat
preloadImages().then(() => {
    requestAnimationFrame(update);
});