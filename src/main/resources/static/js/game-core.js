// [game-core.js]
const Core = (function() {
    let stompClient = null;
    let myId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    let myNickname = "";
    let currentRoomId = "";
    let GameImpl = null;
    let CONFIG = { apiPath: "", wsPath: "/ws" };

    function sendActionInternal(data) {
        if (!stompClient || !currentRoomId) return;
        stompClient.send(`/app/${currentRoomId}/action`, {}, JSON.stringify({
            type: 'ACTION',
            senderId: myId,
            sender: myNickname,
            data: data
        }));
    }

    function init(implementation, config) {
        GameImpl = implementation;
        if(config) {
            if(config.apiPath !== undefined) CONFIG.apiPath = config.apiPath;
            if(config.wsPath !== undefined) CONFIG.wsPath = config.wsPath;
            if(config.gameName) {
                const titleEl = document.getElementById('game-title-header');
                if(titleEl) titleEl.innerText = config.gameName;
            }
        }
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') document.body.classList.add('dark-mode');
        else document.body.classList.remove('dark-mode');

        // 👇 [수정됨] 닉네임 감지 로직 강화
        let savedNick = localStorage.getItem('nickname');

        // 1. 닉네임이 없으면 토큰에서 추출 시도
        if (!savedNick) {
            const token = localStorage.getItem('token') || localStorage.getItem('jwt'); // 'token' 키 확인
            if (token) {
                try {
                    // JWT 페이로드 디코딩 (base64)
                    const base64Url = token.split('.')[1];
                    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
                        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                    }).join(''));

                    const payload = JSON.parse(jsonPayload);

                    // 토큰 안에 닉네임이 있는지 확인 (JwtUtil 구현에 따라 다름)
                    // 보통 nickname, name, sub 중 하나에 들어있음
                    if (payload.nickname) savedNick = payload.nickname;
                    else if (payload.name) savedNick = payload.name;
                    else if (payload.sub) savedNick = payload.sub; // sub를 닉네임으로 쓰는 경우

                    if(savedNick) {
                        console.log("토큰에서 닉네임 추출 성공: " + savedNick);
                        localStorage.setItem('nickname', savedNick); // 다음을 위해 저장
                    }
                } catch (e) {
                    console.warn("토큰 파싱 실패:", e);
                }
            }
        }

        if(savedNick) {
            console.log("자동 로그인 감지: " + savedNick);
            myNickname = savedNick;

            // UI 바로 넘기기 (입력창 숨김 -> 로비 표시)
            const welcome = document.getElementById('welcome-msg');
            if(welcome) welcome.innerText = ` ${myNickname}님`;

            const loginScreen = document.getElementById('login-screen');
            const lobbyScreen = document.getElementById('lobby-screen');

            if(loginScreen) loginScreen.classList.add('hidden');
            if(lobbyScreen) lobbyScreen.classList.remove('hidden');

            loadRooms();
        }
        console.log("[GameCore] Initialized");
    }

    function login() {
        const input = document.getElementById('nicknameInput').value.trim();
        if (!input) return showAlert("닉네임을 입력하세요.");
        localStorage.setItem('nickname', input);
        myNickname = input;
        document.getElementById('welcome-msg').innerText = ` ${myNickname}님`;
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('lobby-screen').classList.remove('hidden');
        loadRooms();
    }

    function loadRooms() {
        fetch(`${CONFIG.apiPath}/api/rooms`)
            .then(res => res.json())
            .then(rooms => {
                const list = document.getElementById('room-list');
                list.innerHTML = '';
                if (!rooms.length) list.innerHTML = '<li style="padding:15px; text-align:center; color:#888;">생성된 방이 없습니다.</li>';
                rooms.forEach(r => {
                    const li = document.createElement('li');
                    li.className = 'room-item';
                    li.innerHTML = `<span style="font-weight:bold;">${r.roomName}</span> <button class="btn-default" onclick="Core.joinRoom('${r.roomId}', '${r.roomName}')">참가</button>`;
                    list.appendChild(li);
                });
            })
            .catch(err => showAlert("방 목록 로드 실패"));
    }

    function createRoom() {
        const name = document.getElementById('roomNameInput').value;
        if (!name) return showAlert("방 제목을 입력하세요.");
        fetch(`${CONFIG.apiPath}/api/rooms?name=${encodeURIComponent(name)}`, { method: 'POST' })
            .then(res => res.json())
            .then(room => joinRoom(room.roomId, room.roomName))
            .catch(err => showAlert("방 생성 실패: " + err));
    }

    // --- [중요 수정] 입장 로직 ---
    function joinRoom(roomId, roomName) {
        fetch(`${CONFIG.apiPath}/api/rooms/${roomId}`)
            .then(res => res.json())
            .then(room => {
                currentRoomId = roomId;
                const titleText = document.getElementById('room-title-text');
                if(titleText) titleText.innerText = roomName;

                document.getElementById('lobby-screen').classList.add('hidden');
                document.getElementById('game-screen').classList.remove('hidden');
                document.getElementById('messages').innerHTML = '';

                // ★★★ 여기 있던 stage.innerHTML = '' 코드를 삭제했습니다 ★★★
                // 이제 index.html에 작성한 뼈대가 지워지지 않고 유지됩니다.

                // 게임별 초기화 로직 실행
                if (GameImpl.onEnterRoom) GameImpl.onEnterRoom();

                connectStomp(roomId);
            })
            .catch(err => showAlert("입장 실패: " + err));
    }

    function connectStomp(roomId) {
        const socket = new SockJS(CONFIG.wsPath);
        stompClient = Stomp.over(socket);
        stompClient.debug = null;
        stompClient.connect({}, function () {
            // 👇 1. 여기서 joinData를 아주 잘 만드셨습니다.
            const joinData = {
                type: 'JOIN',
                sender: myNickname,
                senderId: myId,
                data: {
                    dbUsername: localStorage.getItem('username')
                }
            };

            stompClient.send(`/app/${roomId}/join`, {}, JSON.stringify(joinData));
            stompClient.subscribe(`/topic/${roomId}`, function (msg) {
                handleCommonMessage(JSON.parse(msg.body));
            });
        }, function(error) {
            showAlert("서버 연결 끊김");
        });
    }

    function handleCommonMessage(msg) {
        if (msg.type === 'CHAT') showChat(msg.sender, msg.content);
        else if (msg.type === 'EXIT') showChat('SYSTEM', msg.content);
        else if (msg.type === 'GAME_OVER') {
            document.getElementById('ranking-modal').classList.remove('hidden');
            const wName = (msg.data && msg.data.winnerName) ? msg.data.winnerName : "Unknown";
            document.getElementById('winnerName').innerText = wName + " 승리!";
        }
        else {
            if (GameImpl.handleMessage) GameImpl.handleMessage(msg, myId);
        }
    }

    function sendChat() {
        const input = document.getElementById('chatInput');
        if (!input.value.trim()) return;
        stompClient.send(`/app/${currentRoomId}/chat`, {}, JSON.stringify({ type: 'CHAT', sender: myNickname, senderId: myId, content: input.value }));
        input.value = '';
    }

    function showChat(sender, msg) {
        const div = document.createElement('div');
        div.className = sender === 'SYSTEM' ? 'msg-system' : 'msg-item';
        div.innerHTML = sender === 'SYSTEM' ? msg : `<span style="font-weight:bold;">${sender}</span>: ${msg}`;
        const box = document.getElementById('messages');
        if(box) { box.appendChild(div); box.scrollTop = box.scrollHeight; }
    }

    function showAlert(msg) {
        document.getElementById('alert-msg-text').innerText = msg;
        document.getElementById('alert-modal').classList.remove('hidden');
    }
    function closeAlert() { document.getElementById('alert-modal').classList.add('hidden'); }
    function closeRanking() {
        document.getElementById('ranking-modal').classList.add('hidden');
        exitRoom();
    }
    function exitRoom() {
        if(stompClient) stompClient.disconnect();
        location.reload();
    }
    function toggleTheme() {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    }
    function showConfirm(msg, callback) {
        document.getElementById('confirm-msg-text').innerText = msg;
        document.getElementById('confirm-modal').classList.remove('hidden');
        pendingConfirmCallback = callback;
    }
    function closeConfirm() {
        document.getElementById('confirm-modal').classList.add('hidden');
        pendingConfirmCallback = null;
    }
    function confirmOk() {
        if (pendingConfirmCallback) pendingConfirmCallback();
        closeConfirm();
    }
    function showRanking() {

        fetch(`${CONFIG.apiPath}/api/rooms/rankings?gameType=${CONFIG.apiPath.substring(1)}`)
            .then(res => {
                if(!res.ok) throw new Error("랭킹 로드 실패");
                return res.json();
            })
            .then(records => {
                const tbody = document.getElementById('ranking-list-body');
                tbody.innerHTML = '';

                if (!records || records.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#888;">등록된 랭킹이 없습니다.</td></tr>';
                } else {
                    records.forEach((rec, index) => {
                        // 1,2,3등은 메달 아이콘 표시
                        let rankDisplay = index + 1;
                        if(index === 0) rankDisplay = "🥇";
                        else if(index === 1) rankDisplay = "🥈";
                        else if(index === 2) rankDisplay = "🥉";

                        const tr = document.createElement('tr');
                        // 유저 닉네임은 user 객체 안에 있음
                        const nickname = rec.user ? rec.user.nickname : "Unknown";

                        tr.innerHTML = `
                            <td style="text-align:center; font-weight:bold; font-size:1.1em;">${rankDisplay}</td>
                            <td style="text-align:left;">${nickname}</td>
                            <td style="text-align:right; font-weight:bold; color:#d9534f;">${rec.score.toLocaleString()}</td>
                        `;
                        tbody.appendChild(tr);
                    });
                }
                document.getElementById('leaderboard-modal').classList.remove('hidden');
            })
            .catch(err => showAlert("랭킹을 불러오지 못했습니다: " + err));
    }

    function closeLeaderboard() {
        document.getElementById('leaderboard-modal').classList.add('hidden');
    }
    return {
        init, login, createRoom, joinRoom, loadRooms, sendChat,
        showAlert, closeAlert,
        showConfirm, closeConfirm, confirmOk, // 모달 함수들 공개
        closeRanking, exitRoom, toggleTheme,
        showRanking,      // 👈 추가
        closeLeaderboard,
        startGame: () => sendActionInternal({ actionType: 'START' }),
        sendAction: (data) => sendActionInternal(data)
    };
})();