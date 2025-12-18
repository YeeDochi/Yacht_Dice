// [yacht.js]
const YachtGame = {
    myId: null,
    viewingPlayerId: null,
    playerNames: {},
    lastRollCount: 3,

    onEnterRoom: () => {
        YachtGame.myId = null;
        YachtGame.viewingPlayerId = null;
        YachtGame.playerNames = {};
        YachtGame.lastRollCount = 3;
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

        // 점수판 그리기 (데이터에 dice 정보도 함께 넘겨줌)
        renderScoreBoard(data.scoreBoards, data.currentTurnId, myId, data.dice);

        if(data.rollCount !== undefined) {
            YachtGame.lastRollCount = data.rollCount;
        }
    }
};

// --- 기존 updateControls, updateDice, renderUserList 함수는 그대로 유지 ---
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

    const shouldAnimate = (data.rollCount < YachtGame.lastRollCount);

    if (container.children.length === 0) {
        container.innerHTML = '';
        for(let i=0; i<5; i++) {
            const d = document.createElement('div');
            d.className = 'dice';
            container.appendChild(d);
        }
    }

    const diceDivs = container.querySelectorAll('.dice');
    const isMyTurn = (data.currentTurnId === myId);

    const diceFaces = ['-', '1', '2', '3', '4', '5', '6'];

    data.dice.forEach((val, idx) => {
        const d = diceDivs[idx];
        const isKept = data.kept[idx];

        d.className = `dice ${isKept ? 'kept' : ''}`;
        d.onclick = null;
        if (isMyTurn && data.rollCount < 3) {
            d.onclick = () => Core.sendAction({ actionType: 'TOGGLE_KEEP', index: idx });
        }

        if (shouldAnimate && !isKept && val !== 0) {
            d.classList.add('rolling');
            let interval = setInterval(() => {
                d.innerText = Math.floor(Math.random() * 6) + 1;
            }, 50);

            setTimeout(() => {
                clearInterval(interval);
                d.classList.remove('rolling');
                d.innerText = diceFaces[val] || '-';
            }, 600);
        } else {
            if (!d.classList.contains('rolling')) {
                d.innerText = diceFaces[val] || '-';
            }
        }
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
        let subSum = 0;
        const scores = scoreBoards[pid];

        scores.forEach((s, idx) => {
            if(s !== -1) {
                total += s;
                if(idx <= 5) subSum += s;
            }
        });
        if(subSum >= 63) total += 35;

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
            // 점수판 갱신 시 주사위 정보가 없으면 미리보기가 안 나올 수 있으므로 주의 (여기선 일단 갱신만)
            const lastData = YachtGame.lastGameData || {};
            renderScoreBoard(scoreBoards, currentTurnId, myId, lastData.dice);
        };
        listEl.appendChild(div);
    });
}

// -----------------------------------------------------------
// [핵심] 점수 미리보기 계산 함수 (서버 로직의 JS 버전)
function calculatePotentialScore(categoryIdx, dice) {
    if (!dice || dice.includes(0)) return 0; // 주사위가 없거나 굴리기 전이면 0

    const counts = [0, 0, 0, 0, 0, 0, 0];
    let sum = 0;
    for (let d of dice) {
        counts[d]++;
        sum += d;
    }

    // 1~6 (Ones ~ Sixes)
    if (categoryIdx >= 0 && categoryIdx <= 5) {
        return counts[categoryIdx + 1] * (categoryIdx + 1);
    }
    // Choice
    if (categoryIdx === 6) return sum;
    // 4 of a Kind
    if (categoryIdx === 7) {
        for (let i = 1; i <= 6; i++) if (counts[i] >= 4) return sum;
        return 0;
    }
    // Full House
    if (categoryIdx === 8) {
        let three = false, two = false;
        for (let i = 1; i <= 6; i++) {
            if (counts[i] === 3) three = true;
            if (counts[i] === 2) two = true;
            if (counts[i] === 5) { three = true; two = true; }
        }
        return (three && two) ? sum : 0;
    }
    // S. Straight (15점)
    if (categoryIdx === 9) {
        if ((counts[1] && counts[2] && counts[3] && counts[4] && counts[5])) return 30;
        return 0;
    }
    // L. Straight (30점)
    if (categoryIdx === 10) {
        if ((counts[2] && counts[3] && counts[4] && counts[5] && counts[6])) return 30;
        return 0;
    }
    // Yacht (50점)
    if (categoryIdx === 11) {
        for (let i = 1; i <= 6; i++) if (counts[i] === 5) return 50;
        return 0;
    }
    return 0;
}

// 점수판 렌더링 (미리보기 포함)
function renderScoreBoard(scoreBoards, currentTurnId, myId, currentDice) {
    // 미리보기를 위해 데이터를 저장해둠 (목록 클릭 시 사용)
    if(currentDice) YachtGame.lastGameData = { dice: currentDice };
    else if(YachtGame.lastGameData) currentDice = YachtGame.lastGameData.dice;

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

    tbody.innerHTML = '';

    const categories = ["Ones", "Twos", "Threes", "Fours", "Fives", "Sixes", "Choice", "4 of Kind", "Full House", "S.Straight", "L.Straight", "Yacht"];

    // 1. 상단
    let subTotal = 0;
    for (let i = 0; i < 6; i++) {
        const score = scores[i];
        if (score !== -1) subTotal += score;
        tbody.appendChild(createRow(categories[i], score, i, targetId, myId, currentTurnId, currentDice));
    }

    const bonus = (subTotal >= 63) ? 35 : 0;
    tbody.appendChild(createSummaryRow("Subtotal (63+)", `${subTotal} / 63`));
    tbody.appendChild(createSummaryRow("Bonus (+35)", `+${bonus}`));

    // 2. 하단
    let lowerTotal = 0;
    for (let i = 6; i < 12; i++) {
        const score = scores[i];
        if (score !== -1) lowerTotal += score;
        tbody.appendChild(createRow(categories[i], score, i, targetId, myId, currentTurnId, currentDice));
    }

    // 3. 총점
    const grandTotal = subTotal + bonus + lowerTotal;
    const totalRow = createSummaryRow("TOTAL", grandTotal);
    totalRow.className = "total-row";
    tbody.appendChild(totalRow);
}

// 행 생성 (미리보기 로직 적용)
function createRow(name, score, idx, targetId, myId, currentTurnId, currentDice) {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.className = 'category-name';
    tdName.innerText = name;
    tr.appendChild(tdName);

    const tdScore = document.createElement('td');
    tdScore.className = 'score-cell';

    if (score !== -1) {
        // 이미 확정된 점수
        tdScore.innerText = score;
        tdScore.classList.add('filled');
    } else {
        // 빈 칸
        if (targetId === myId && currentTurnId === myId) {
            // [미리보기] 내 턴이고 아직 안 채운 칸이면 예상 점수 표시
            if (currentDice && !currentDice.includes(0)) {
                const potential = calculatePotentialScore(idx, currentDice);
                tdScore.innerText = potential;
                tdScore.classList.add('score-preview'); // 회색 글씨 스타일
            } else {
                tdScore.innerText = '';
            }

            // 클릭 이벤트
            tdScore.onclick = () => {
                // 클릭 시 현재 보여지는 미리보기 점수도 함께 안내하면 좋음
                const potential = (currentDice && !currentDice.includes(0)) ? calculatePotentialScore(idx, currentDice) : 0;
                Core.showConfirm(`[${name}] ${potential}점으로 확정하시겠습니까?`, () => {
                    Core.sendAction({ actionType: 'SUBMIT', categoryIdx: idx });
                });
            };
        } else {
            tdScore.innerText = '';
            tdScore.style.cursor = "default";
        }
    }
    tr.appendChild(tdScore);
    return tr;
}

function createSummaryRow(title, value) {
    const tr = document.createElement('tr');
    tr.className = 'summary-row';
    const tdName = document.createElement('td');
    tdName.className = 'category-name';
    tdName.innerText = title;
    tr.appendChild(tdName);
    const tdVal = document.createElement('td');
    tdVal.innerText = value;
    tdVal.style.textAlign = 'center';
    tr.appendChild(tdVal);
    return tr;
}

Core.init(YachtGame, {
    apiPath: '/Yacht_Dice',
    wsPath: '/Yacht_Dice/ws',
    gameName: '🎲 Yacht Dice'
});