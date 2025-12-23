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
        renderScoreBoard(data.scoreBoards, data.currentTurnId, myId, data.dice);

        if(data.rollCount !== undefined) {
            YachtGame.lastRollCount = data.rollCount;
        }
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
            turnMsg.style.fontWeight = "bold";
        }
        if(rollBtn) {
            // 일단 데이터 기반으로 상태 설정 (updateDice에서 애니메이션 중이면 다시 잠금)
            rollBtn.disabled = !(isMyTurn && data.rollCount > 0);
        }
        if(rollCnt) rollCnt.innerText = (data.rollCount !== undefined) ? data.rollCount : 3;
    }
}

function updateDice(data, myId) {
    const container = document.getElementById('dice-container');
    const rollBtn = document.getElementById('btn-roll'); // 버튼 참조 추가

    if (!container || !data.dice) return;

    const shouldAnimate = (data.rollCount < YachtGame.lastRollCount);

    // [기능 추가] 애니메이션 시작 시 버튼 잠금
    if (shouldAnimate && rollBtn) {
        rollBtn.disabled = true;
        rollBtn.style.cursor = "wait";
    }

    // 컨테이너 초기화
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

    // 주사위 정렬 매핑
    let mappedDice = data.dice.map((val, idx) => ({
        val: val,
        kept: data.kept[idx],
        origIdx: idx
    }));

    mappedDice.sort((a, b) => a.val - b.val);

    mappedDice.forEach((item, visualIdx) => {
        const d = diceDivs[visualIdx];
        const val = item.val;
        const isKept = item.kept;
        const origIdx = item.origIdx;

        d.className = `dice ${isKept ? 'kept' : ''}`;
        d.onclick = null;

        if (isMyTurn && data.rollCount < 3) {
            d.onclick = () => Core.sendAction({ actionType: 'TOGGLE_KEEP', index: origIdx });
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

    // 족보 체크 및 버튼 잠금 해제 로직
    if (shouldAnimate) {
        setTimeout(() => {
            checkAndShowRank(data.dice, isMyTurn);

            // [기능 추가] 애니메이션 끝난 후 버튼 상태 복구
            if (rollBtn) {
                rollBtn.style.cursor = ""; // 커서 복구
                // 내 턴이고 굴릴 기회가 남았다면 다시 활성화
                if (isMyTurn && data.rollCount > 0) {
                    rollBtn.disabled = false;
                }
            }
        }, 600);
    } else {
        checkAndShowRank(data.dice, isMyTurn);
    }
}

function checkAndShowRank(dice, isMyTurn) {
    if (!isMyTurn) return;

    const turnMsg = document.getElementById('turn-msg');
    if (!turnMsg) return;

    if (!dice || dice.includes(0)) return;

    const counts = [0, 0, 0, 0, 0, 0, 0];
    dice.forEach(d => counts[d]++);

    let msg = "";
    let isHighRank = false;

    // 1. Yacht
    if (counts.some(c => c === 5)) {
        msg = "✨ YACHT! (50점) ✨";
        isHighRank = true;
    }
    // 2. 4 of a Kind
    else if (counts.some(c => c >= 4)) {
        msg = "🔥 4 of a Kind 🔥";
        isHighRank = true;
    }
    // 3. Full House
    else if (counts.some(c => c === 3) && counts.some(c => c === 2)) {
        msg = "🏠 Full House 🏠";
        isHighRank = true;
    }
    // 4. Large Straight
    else if (counts[2] && counts[3] && counts[4] && counts[5] && counts[6]) {
        msg = "📏 Large Straight (30점)";
        isHighRank = true;
    }
    // 5. Small Straight
    else if (counts[1] && counts[2] && counts[3] && counts[4] && counts[5]) {
        msg = "📏 Small Straight (30점)";
        isHighRank = true;
    }

    if (msg) {
        turnMsg.innerText = msg;
        turnMsg.style.color = "#ff4500";

        turnMsg.style.animation = 'none';
        turnMsg.offsetHeight;
        turnMsg.style.animation = "pop 0.3s ease-out";

        if (isHighRank && window.confetti) {
            confetti({
                particleCount: 50,
                spread: 60,
                origin: { y: 0.65 },
                colors: ['#FFD700', '#FFA500', '#FF4500']
            });
        }
    }
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
            const lastData = YachtGame.lastGameData || {};
            renderScoreBoard(scoreBoards, currentTurnId, myId, lastData.dice);
        };
        listEl.appendChild(div);
    });
}

function calculatePotentialScore(categoryIdx, dice) {
    if (!dice || dice.includes(0)) return 0;

    const counts = [0, 0, 0, 0, 0, 0, 0];
    let sum = 0;
    for (let d of dice) {
        counts[d]++;
        sum += d;
    }

    if (categoryIdx >= 0 && categoryIdx <= 5) {
        return counts[categoryIdx + 1] * (categoryIdx + 1);
    }
    if (categoryIdx === 6) return sum;
    if (categoryIdx === 7) {
        for (let i = 1; i <= 6; i++) if (counts[i] >= 4) return sum;
        return 0;
    }
    if (categoryIdx === 8) {
        let three = false, two = false;
        for (let i = 1; i <= 6; i++) {
            if (counts[i] === 3) three = true;
            if (counts[i] === 2) two = true;
            if (counts[i] === 5) { three = true; two = true; }
        }
        return (three && two) ? sum : 0;
    }
    if (categoryIdx === 9) {
        if ((counts[1] && counts[2] && counts[3] && counts[4] && counts[5])) return 30;
        return 0;
    }
    if (categoryIdx === 10) {
        if ((counts[2] && counts[3] && counts[4] && counts[5] && counts[6])) return 30;
        return 0;
    }
    if (categoryIdx === 11) {
        for (let i = 1; i <= 6; i++) if (counts[i] === 5) return 50;
        return 0;
    }
    return 0;
}

function renderScoreBoard(scoreBoards, currentTurnId, myId, currentDice) {
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

    let subTotal = 0;
    for (let i = 0; i < 6; i++) {
        const score = scores[i];
        if (score !== -1) subTotal += score;
        tbody.appendChild(createRow(categories[i], score, i, targetId, myId, currentTurnId, currentDice));
    }

    const bonus = (subTotal >= 63) ? 35 : 0;
    tbody.appendChild(createSummaryRow("Subtotal (63+)", `${subTotal} / 63`));
    tbody.appendChild(createSummaryRow("Bonus (+35)", `+${bonus}`));

    let lowerTotal = 0;
    for (let i = 6; i < 12; i++) {
        const score = scores[i];
        if (score !== -1) lowerTotal += score;
        tbody.appendChild(createRow(categories[i], score, i, targetId, myId, currentTurnId, currentDice));
    }

    const grandTotal = subTotal + bonus + lowerTotal;
    const totalRow = createSummaryRow("TOTAL", grandTotal);
    totalRow.className = "total-row";
    tbody.appendChild(totalRow);
}

function createRow(name, score, idx, targetId, myId, currentTurnId, currentDice) {
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
        if (targetId === myId && currentTurnId === myId) {
            if (currentDice && !currentDice.includes(0)) {
                const potential = calculatePotentialScore(idx, currentDice);
                tdScore.innerText = potential;
                tdScore.classList.add('score-preview');
            } else {
                tdScore.innerText = '';
            }

            tdScore.onclick = () => {
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