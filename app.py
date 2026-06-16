from flask import Flask, render_template, request, jsonify, url_for
import json
import os

app = Flask(__name__)
DATA_FILE = 'data/scores.json'

# Ensure data folder and file exist
os.makedirs('data', exist_ok=True)
if not os.path.exists(DATA_FILE):
    with open(DATA_FILE, 'w') as f:
        json.dump([], f)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/start_game', methods=['POST'])
def start_game():
    return jsonify({'status': 'started', 'redirect': url_for('game_page')})

@app.route('/game')
def game_page():
    return render_template('game.html') 

@app.route('/api/get_scores', methods=['GET'])
def get_scores():
    with open(DATA_FILE, 'r') as f:
        scores = json.load(f)
    
    formatted_scores = [{'name': name, 'score': score} for name, score in scores.items()]
    
    top_scores = sorted(formatted_scores, key=lambda x: x['score'], reverse=True)[:5]
    return jsonify(top_scores)

@app.route('/api/save_score', methods=['POST'])
def save_score():
    try:
        data = request.get_json()
        player_name = data.get('name').strip()
        score = int(data.get('score'))

        with open(DATA_FILE, 'r') as f:
            scores = json.load(f)
        
        if player_name not in scores or scores[player_name] < score:
            scores[player_name] = score
        
        with open(DATA_FILE, 'w') as f:
            json.dump(scores, f, indent=4)
            
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({"status":f"error: {e}"})

if __name__ == '__main__':
    # Hosting on 0.0.0.0 makes it easier to access from any environment
    app.run(host='0.0.0.0', port=5000, debug=True)
