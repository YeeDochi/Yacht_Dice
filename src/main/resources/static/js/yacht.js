// [yacht.js]
const YachtGame = {
    myId: null,
    viewingPlayerId: null,
    playerNames: {},

    onEnterRoom: () => {
        YachtGame.myId = null;
        YachtGame.viewingPlayerId = null;
        YachtGame.playerNames = {};
        console.log("Joined Room.");
    },

    handleMessage: (msg, myId) => {
        if (msg.type === 'GAME_OVER') return;

        YachtGame.myId = myId;
        const data = msg.data;
        if (!data) return;

        if (data.playerNames) {
            YachtGame.playerNames = data.playerNames;
        }

        updateControls(data, myId);
        updateDice(data, myId);
        renderUserList(data.scoreBoards, data.currentTurnId, myId);
        renderScoreBoard(data.scoreBoards, data.currentTurnId, myId);
    }
};

function updateControls(data, myId) {
    const startBtn = document.getElementById('startBtn');
    const turnBadge = document.getElementById('game-status');
    const turnMsg = document.getElementById('turn-msg');
    const rollBtn = document.getElementById('btn-roll');
    const rollCnt = document.getElementById('roll-cnt');

    if (startBtn && data.currentTurnId) {
        startBtn.disabled = true;
        startBtn.innerText = "진행 중";
        startBtn.style.opacity = 0.6;
        startBtn.style.cursor = "not-allowed";
    }

    if (data.currentTurnId) {
        const isMyTurn = (data.currentTurnId === myId);
        if(turnBadge) {
            turnBadge.innerText = isMyTurn ? "🟢 나의 턴" : "🔴 상대 턴";
            turnBadge.style.borderColor = isMyTurn ? "var(--status-online)" : "var(--status-offline)";
            turnBadge.style.color = "var(--text-secondary)";
        }
        if(turnMsg) {
            turnMsg.innerText = isMyTurn ? "주사위를 굴리세요!" : "상대방이 고민 중...";
            turnMsg.style.color = isMyTurn ? "var(--status-online)" : "var(--text-secondary)";
        }
        if(rollBtn) {
            rollBtn.disabled = !(isMyTurn && data.rollCount > 0);
        }
        if(rollCnt) rollCnt.innerText = (data.rollCount !== undefined) ? data.rollCount : 3;
    }
}

function updateDice(data, myId) {
    const container = document.getElementById('dice-container');
    if (!container || !data.dice) return;

    container.innerHTML = '';
    const isMyTurn = (data.currentTurnId === myId);
    const diceFaces = ['?', '1', '2', '3', '4', '5', '6'];

    data.dice.forEach((val, idx) => {
        const d = document.createElement('div');
        d.className = `dice ${data.kept[idx] ? 'kept' : ''}`;
        d.innerText = diceFaces[val] || '?';

        if (isMyTurn && data.rollCount < 3) {
            d.onclick = () => Core.sendAction({ actionType: 'TOGGLE_KEEP', index: idx });
        }
        container.appendChild(d);
    });
}

function renderUserList(scoreBoards, currentTurnId, myId) {
    const listEl = document.getElementById('user-list-area');
    if (!scoreBoards || !listEl) return;

    const playerIds = Object.keys(scoreBoards);
    if (!YachtGame.viewingPlayerId) YachtGame.viewingPlayerId = myId;

    listEl.innerHTML = '';

    playerIds.forEach(pid => {
        let total = 0;
        scoreBoards[pid].forEach(s => { if(s !== -1) total += s; });

        const div = document.createElement('div');
        div.className = 'user-row';

        if (pid === currentTurnId) div.classList.add('turn');
        if (pid === YachtGame.viewingPlayerId) div.classList.add('active');

        const realName = YachtGame.playerNames[pid] || "Unknown";
        const displayName = (pid === myId) ? `나 (${realName})` : realName;

        div.innerHTML = `
            <div>
                <span>${displayName}</span>
                <span style="font-size:11px; color:var(--text-secondary);"> (${total}점)</span>
            </div>
            ${pid === currentTurnId ? '🎲' : ''}
        `;

        div.onclick = () => {
            YachtGame.viewingPlayerId = pid;
            renderUserList(scoreBoards, currentTurnId, myId);
            renderScoreBoard(scoreBoards, currentTurnId, myId);
        };
        listEl.appendChild(div);
    });
}

function renderScoreBoard(scoreBoards, currentTurnId, myId) {
    const tbody = document.getElementById('score-body');
    const headerName = document.getElementById('score-header-name');
    const targetId = YachtGame.viewingPlayerId || myId;
    const scores = scoreBoards[targetId];

    if (!scores || !tbody) return;

    if(headerName) {
        const targetName = YachtGame.playerNames[targetId] || "Unknown";
        headerName.innerText = (targetId === myId) ? "나의 점수" : `${targetName}의 점수`;
        headerName.style.color = (targetId === myId) ? "var(--link-color)" : "var(--status-offline)";
    }

    const categories = ["Ones", "Twos", "Threes", "Fours", "Fives", "Sixes", "Choice", "4 of Kind", "Full House", "S.Straight", "L.Straight", "Yacht"];
    tbody.innerHTML = '';

    categories.forEach((name, idx) => {
        const score = scores[idx];
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.className = 'category-name';
        tdName.innerText = name;
        tr.appendChild(tdName);

        const tdScore = document.createElement('td');
        tdScore.className = 'score-cell';

        if (score !== -1) {
            tdScore.innerText = score;
            tdScore.classList.add('filled');
        } else {
            tdScore.innerText = '';
            if (targetId === myId && currentTurnId === myId) {
                // [수정] 기본 confirm() -> Core.showConfirm()으로 변경
                tdScore.onclick = () => {
                    Core.showConfirm(`[${name}] 점수를 확정하시겠습니까?`, () => {
                        Core.sendAction({ actionType: 'SUBMIT', categoryIdx: idx });
                    });
                };
            } else {
                tdScore.style.cursor = "default";
            }
        }
        tr.appendChild(tdScore);
        tbody.appendChild(tr);
    });
}

Core.init(YachtGame, {
    apiPath: '/Yacht_Dice',
    wsPath: '/Yacht_Dice/ws',
    gameName: '🎲 Yacht Dice'
});