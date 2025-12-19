package org.example.yacht_dice.dto;
import java.util.*;

public class YachtRoom extends BaseGameRoom {
    private int[] dice = new int[]{0, 0, 0, 0, 0}; // 초기값 0으로 설정
    private boolean[] kept = new boolean[5];
    private int rollCount = 3;
    private String currentTurnId;

    private Map<String, Integer[]> scoreBoards = new HashMap<>();

    public YachtRoom(String name) {
        super(name);
    }

    public void startGame() {
        List<String> playerIds = new ArrayList<>(users.keySet());
        if(playerIds.size() < 1) return;

        scoreBoards.clear();
        for (String pid : playerIds) {
            Integer[] board = new Integer[12];
            Arrays.fill(board, -1);
            scoreBoards.put(pid, board);
        }

        this.currentTurnId = playerIds.get(0);
        this.rollCount = 3;
        this.playing = true;
        resetDiceForNewTurn();
    }

    @Override
    public synchronized GameMessage handleAction(GameMessage message) {
        String type = (String) message.getData().get("actionType");
        String senderId = message.getSenderId();

        if ("START".equals(type)) {
            if (playing) return null;
            startGame();
            return makeStateMessage("GAME_START", "야추 게임이 시작되었습니다!");
        }

        if (!playing || currentTurnId == null || !currentTurnId.equals(senderId)) {
            return null;
        }

        if ("ROLL".equals(type)) {
            if (rollCount > 0) {
                rollDice();
                rollCount--;
                return makeStateMessage("UPDATE", null);
            }
        }

        if ("TOGGLE_KEEP".equals(type)) {
            int index = (int) message.getData().get("index");
            if (index >= 0 && index < 5) {
                kept[index] = !kept[index];
                return makeStateMessage("UPDATE", null);
            }
        }

        if ("SUBMIT".equals(type)) {
            int categoryIdx = (int) message.getData().get("categoryIdx");
            Integer[] myBoard = scoreBoards.get(senderId);

            if (categoryIdx >= 0 && categoryIdx < 12 && myBoard[categoryIdx] == -1) {
                myBoard[categoryIdx] = calculateScore(categoryIdx);
                if (checkGameOver()) return finishGame();
                nextTurn();
                return makeStateMessage("UPDATE", "턴이 변경되었습니다.");
            }
        }

        return null;
    }

    private void rollDice() {
        Random r = new Random();
        for (int i = 0; i < 5; i++) {
            if (!kept[i]) dice[i] = r.nextInt(6) + 1;
        }
    }

    // [수정] 턴 초기화 시 굴리지 않고 0으로 리셋 (화면엔 '-' 표시됨)
    private void resetDiceForNewTurn() {
        rollCount = 3;
        Arrays.fill(kept, false);
        Arrays.fill(dice, 0); // 0 = 미결정 상태
    }

    private void nextTurn() {
        List<String> pids = new ArrayList<>(users.keySet());
        int idx = pids.indexOf(currentTurnId);
        currentTurnId = pids.get((idx + 1) % pids.size());
        resetDiceForNewTurn();
    }

    private int calculateScore(int category) {
        int[] counts = new int[7];
        int sum = 0;
        for(int d : dice) {
            // 아직 안 굴린 주사위(0)는 계산 제외
            if(d > 0) {
                counts[d]++;
                sum += d;
            }
        }

        if (category >= 0 && category <= 5) return counts[category + 1] * (category + 1);
        if (category == 6) return sum;
        if (category == 7) {
            for(int i=1; i<=6; i++) if(counts[i] >= 4) return sum;
            return 0;
        }
        if (category == 8) {
            boolean three = false, two = false;
            for(int i=1; i<=6; i++) {
                if(counts[i] == 3) three = true;
                if(counts[i] == 2) two = true;
                if(counts[i] == 5) { three = true; two = true; }
            }
            return (three && two) ? sum : 0;
        }
        if (category == 9) {
            if ((counts[1]>0 && counts[2]>0 && counts[3]>0 && counts[4]>0 && counts[5]>0)) return 30;
            return 0;
        }
        if (category == 10) {
            if ((counts[2]>0 && counts[3]>0 && counts[4]>0 && counts[5]>0 && counts[6]>0)) return 30;
            return 0;
        }
        if (category == 11) {
            for(int i=1; i<=6; i++) if(counts[i] == 5) return 50;
            return 0;
        }
        return 0;
    }

    private boolean checkGameOver() {
        for (Integer[] board : scoreBoards.values()) {
            for (int score : board) if (score == -1) return false;
        }
        return true;
    }

    private GameMessage finishGame() {
        this.playing = false;
        String winner = "";
        int maxScore = -1;

        for (String pid : scoreBoards.keySet()) {
            int total = 0;
            Integer[] board = scoreBoards.get(pid);
            int subTotalTop = 0;

            for(int i=0; i<12; i++) {
                int s = (board[i] == -1) ? 0 : board[i];
                total += s;
                if(i <= 5) subTotalTop += s;
            }

            if(subTotalTop >= 63) total += 35;

            if (total > maxScore) {
                maxScore = total;
                if(users.containsKey(pid)) winner = users.get(pid).getNickname();
                else winner = "Unknown";
            }
        }

        Map<String, Object> dataMap = new HashMap<>();
        dataMap.put("winnerName", winner);
        dataMap.put("scoreBoards", scoreBoards);

        GameMessage msg = new GameMessage();
        msg.setType("GAME_OVER");
        msg.setRoomId(this.roomId);
        msg.setContent("게임 종료! 승자: " + winner);
        msg.setData(dataMap);

        return msg;
    }

    private GameMessage makeStateMessage(String type, String content) {
        GameMessage msg = new GameMessage();
        msg.setType(type);
        msg.setRoomId(this.roomId);
        msg.setContent(content);

        Map<String, String> playerNames = new HashMap<>();
        for (Player p : users.values()) {
            playerNames.put(p.getId(), p.getNickname());
        }

        msg.setData(Map.of(
                "dice", dice,
                "kept", kept,
                "rollCount", rollCount,
                "currentTurnId", currentTurnId != null ? currentTurnId : "",
                "scoreBoards", scoreBoards,
                "playerNames", playerNames
        ));
        return msg;
    }
    public Map<String, Object> getGameSnapshot() {
        Map<String, String> playerNames = new HashMap<>();
        for (Player p : users.values()) {
            playerNames.put(p.getId(), p.getNickname());
        }

        // makeStateMessage 내부 로직과 동일한 데이터를 Map으로 반환
        return Map.of(
                "dice", dice,
                "kept", kept,
                "rollCount", rollCount,
                "currentTurnId", currentTurnId != null ? currentTurnId : "",
                "scoreBoards", scoreBoards,
                "playerNames", playerNames,
                "playing", playing // 게임 진행 중인지 여부도 추가하면 좋음
        );
    }
}