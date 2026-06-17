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

const carImage = new Image();
const truckImage = new Image();
let imagesLoaded = false;

function preloadImages() {
    const assets = [
        { img: carImage, src: '/static/assets/car.png' },
        { img: truckImage, src: '/static/assets/truck.png' }
    ];

    return Promise.all(assets.map(asset => {
        return new Promise((resolve) => {
            asset.img.onload = resolve;
            asset.img.onerror = resolve;
            asset.img.src = asset.src;
        });
    })).then(() => {
        imagesLoaded = true;
    });
}

function drawVehicleWithTint(img, x, y, width, height, color, alpha = 0.45) {
    if (imagesLoaded && img.complete && img.naturalWidth) {
        // 1. Önce orijinal araba görselini direkt çiziyoruz (Böylece camlar, aynalar orijinal kalıyor)
        ctx.drawImage(img, x, y, width, height);
        
        // 2. Sadece gri bölgeleri boyayabilmek için geçici (off-screen) bir canvas oluşturuyoruz
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Orijinal görseli bu geçici canvas'a da çiziyoruz
        tempCtx.drawImage(img, 0, 0, width, height);
        
        // 3. Geçici canvas'ın piksel verilerini (RGBA) alıyoruz
        const imgData = tempCtx.getImageData(0, 0, width, height);
        const data = imgData.data;
        
        // 4. Tüm pikselleri tek tek dönerek "gri" olanları tespit ediyoruz
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            
            // Eğer piksel transparan değilse
            if (a > 0) {
                // Gri tonlarında R, G ve B değerleri birbirine çok yakındır.
                // Ayrıca camların canlı mavisini (R: ~50, G: ~170, B: ~220) elemek için 
                // R ve B arasındaki farkın küçük olmasını kontrol ediyoruz.
                const isGray = Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15;
                
                // Camların belirgin mavisini veya farları tamamen korumak için ek güvenlik sınırı (isteğe bağlı)
                const isBlueWindow = (b > r + 40 && b > g + 10); 
                
                if (isGray && !isBlueWindow) {
                    // Bu piksel arabanın gri kaportasına ait!
                    // Burayı transparan bırakıyoruz ki alttaki renklendirme katmanı buraya işlesin
                    data[i + 3] = 0; 
                }
            }
        }
        // Güncellenmiş pikselleri geçici canvas'a geri yüklüyoruz
        tempCtx.putImageData(imgData, 0, 0);
        
        // 5. Şimdi ana canvas üzerinde renklendirme büyüsünü yapıyoruz
        ctx.save();
        // Sadece orijinal arabanın olduğu alana boyama yap (source-atop)
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        // Arabanın üzerini komple hedef renkle kaplıyoruz
        ctx.fillRect(x, y, width, height);
        ctx.restore();
        
        // 6. En son adım: Gri piksellerini sildiğimiz (yani camları, aynaları ve detayları tuttuğumuz maskeyi en üste tekrar çizdiriyoruz.
        ctx.drawImage(tempCanvas, x, y);
        
    } else {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, width, height);
    }
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
        drawVehicleWithTint(carImage, this.x, this.y, this.width, this.height, this.color);
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
        drawVehicleWithTint(truckImage, this.x, this.y, this.width, this.height, this.color);
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
        
        // 1. Pivot Noktası: Aracın gerçek çarpışma kutusunun EN ARKA ORTA noktası
        // Çarpışma kutusu y ile y + CAR_HEIGHT arasındadır. Arka çizgi y + CAR_HEIGHT'tır.
        const pivotX = this.x + CAR_WIDTH / 2;
        const pivotY = this.y + CAR_HEIGHT; 
        
        // 2. Canvas orijinini bu arka orta noktaya taşıyoruz
        ctx.translate(pivotX, pivotY);
        
        // 3. Görsel ters olduğu için Math.PI (180 derece) ekleyerek yönü yukarı çeviriyoruz.
        // Bu dönüşten sonra local +Y ekseni artık ekranın YUKARISINI gösterir.
        ctx.rotate(this.angle + Math.PI);

        // 4. Görseli çiziyoruz:
        // Orijinimiz artık arabanın arkası ve local +Y yukarıyı gösteriyor.
        // Y değerini 0 verdiğimizde, araba tam arkasından (0'dan) ileriye (yukarıya) doğru çizilir.
        drawVehicleWithTint(
            carImage, 
            -CAR_WIDTH / 2, 
            0, // <-- Burası 0 olmalı!
            CAR_WIDTH, 
            CAR_HEIGHT, 
            '#808080', 
            0.35
        );
        
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
preloadImages().then(() => {
    requestAnimationFrame(update);
});
