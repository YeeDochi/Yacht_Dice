package org.example.yacht_dice.dto;
import java.util.*;

public class YachtRoom extends BaseGameRoom {
    // [게임 상태 데이터]
    private int[] dice = new int[]{1, 1, 1, 1, 1}; // 주사위 5개 값
    private boolean[] kept = new boolean[5];       // 주사위 킵(Keep) 상태
    private int rollCount = 3;                     // 남은 굴리기 횟수 (3회)
    private String currentTurnId;                  // 현재 턴 플레이어 ID

    // 점수판: Key=플레이어ID, Value=점수배열 (0~11: 족보별 점수, -1은 미입력)
    // 인덱스: 0~5(Ones~Sixes), 6(Choice), 7(4 of Kind), 8(Full House), 9(S.Straight), 10(L.Straight), 11(Yacht)
    private Map<String, Integer[]> scoreBoards = new HashMap<>();

    public YachtRoom(String name) {
        super(name);
    }

    // 게임 시작 로직
    public void startGame() {
        List<String> playerIds = new ArrayList<>(users.keySet());
        if(playerIds.size() < 1) return; // 최소 1명 이상이어야 시작 가능

        // 점수판 초기화
        scoreBoards.clear();
        for (String pid : playerIds) {
            Integer[] board = new Integer[12];
            Arrays.fill(board, -1); // -1: 아직 점수를 채우지 않음
            scoreBoards.put(pid, board);
        }

        // 첫 번째 플레이어부터 시작
        this.currentTurnId = playerIds.get(0);
        this.rollCount = 3;
        this.playing = true;

        // 턴 시작 시 주사위 초기화
        resetDiceForNewTurn();
    }

    @Override
    public GameMessage handleAction(GameMessage message) {
        String type = (String) message.getData().get("actionType");
        String senderId = message.getSenderId();

        // 1. 게임 시작 (방장만 가능하게 처리하려면 로직 추가 필요)
        if ("START".equals(type)) {
            if (playing) {
                return null;
            }
            startGame();
            return makeStateMessage("GAME_START", "야추 게임이 시작되었습니다!");
        }

        // 게임 진행 중이 아니거나, 내 턴이 아니면 행동 불가
        if (!playing || currentTurnId == null || !currentTurnId.equals(senderId)) {
            return null;
        }

        // 2. 주사위 굴리기 (ROLL)
        if ("ROLL".equals(type)) {
            if (rollCount > 0) {
                rollDice();
                rollCount--;
                return makeStateMessage("UPDATE", null);
            }
        }

        // 3. 주사위 킵/해제 (TOGGLE_KEEP)
        if ("TOGGLE_KEEP".equals(type)) {
            // rollCount가 3일 때(아직 한 번도 안 굴림)는 킵 불가능하게 할 수도 있음
            int index = (int) message.getData().get("index");
            if (index >= 0 && index < 5) {
                kept[index] = !kept[index];
                return makeStateMessage("UPDATE", null);
            }
        }

        // 4. 점수 선택 및 턴 넘기기 (SUBMIT)
        if ("SUBMIT".equals(type)) {
            int categoryIdx = (int) message.getData().get("categoryIdx");
            Integer[] myBoard = scoreBoards.get(senderId);

            // 유효한 인덱스이고, 아직 점수를 채우지 않은 곳이어야 함
            if (categoryIdx >= 0 && categoryIdx < 12 && myBoard[categoryIdx] == -1) {
                // 점수 계산하여 저장
                myBoard[categoryIdx] = calculateScore(categoryIdx);

                // 게임 종료 조건 체크 (모든 플레이어가 모든 칸을 채웠는지)
                if (checkGameOver()) {
                    return finishGame();
                }

                // 다음 턴으로 넘기기
                nextTurn();
                return makeStateMessage("UPDATE", "턴이 변경되었습니다.");
            }
        }

        return null;
    }

    // --- 내부 로직 메서드 ---

    private void rollDice() {
        Random r = new Random();
        for (int i = 0; i < 5; i++) {
            if (!kept[i]) {
                dice[i] = r.nextInt(6) + 1; // 1~6 랜덤
            }
        }
    }

    private void resetDiceForNewTurn() {
        rollCount = 3;
        Arrays.fill(kept, false);
        rollDice(); // 턴 시작과 동시에 한 번 굴리거나, 혹은 0으로 두고 시작하거나 룰에 따라 조정
    }

    private void nextTurn() {
        List<String> pids = new ArrayList<>(users.keySet());
        int idx = pids.indexOf(currentTurnId);
        // 다음 사람 (마지막 사람이면 다시 0번으로)
        currentTurnId = pids.get((idx + 1) % pids.size());

        resetDiceForNewTurn();
    }

    // 족보 점수 계산기 (핵심 로직)
    private int calculateScore(int category) {
        // 주사위 눈금 개수 세기 (count[1]은 1의 개수)
        int[] counts = new int[7];
        int sum = 0;
        for(int d : dice) {
            counts[d]++;
            sum += d;
        }

        // 0~5: Ones ~ Sixes
        if (category >= 0 && category <= 5) {
            return counts[category + 1] * (category + 1);
        }

        // 6: Choice (주사위 총합)
        if (category == 6) return sum;

        // 7: 4 of a Kind (동일한 주사위 4개 이상)
        if (category == 7) {
            for(int i=1; i<=6; i++) if(counts[i] >= 4) return sum;
            return 0;
        }

        // 8: Full House (3개 동일 + 2개 동일)
        if (category == 8) {
            boolean three = false, two = false;
            for(int i=1; i<=6; i++) {
                if(counts[i] == 3) three = true;
                if(counts[i] == 2) two = true;
                if(counts[i] == 5) { three = true; two = true; } // 야추인 경우 풀하우스 인정 여부(룰에 따라 다름)
            }
            return (three && two) ? sum : 0;
        }

        // 9: Small Straight (이어지는 숫자 4개)
        if (category == 9) {
            // 1234, 2345, 3456 확인
            if ((counts[1]>0 && counts[2]>0 && counts[3]>0 && counts[4]>0) ||
                    (counts[2]>0 && counts[3]>0 && counts[4]>0 && counts[5]>0) ||
                    (counts[3]>0 && counts[4]>0 && counts[5]>0 && counts[6]>0)) {
                return 15; // 고정 점수 15점 (또는 30점 룰)
            }
            return 0;
        }

        // 10: Large Straight (이어지는 숫자 5개)
        if (category == 10) {
            if ((counts[1]>0 && counts[2]>0 && counts[3]>0 && counts[4]>0 && counts[5]>0) ||
                    (counts[2]>0 && counts[3]>0 && counts[4]>0 && counts[5]>0 && counts[6]>0)) {
                return 30; // 고정 점수 30점 (또는 40점 룰)
            }
            return 0;
        }

        // 11: Yacht (5개 모두 동일)
        if (category == 11) {
            for(int i=1; i<=6; i++) if(counts[i] == 5) return 50;
            return 0;
        }

        return 0;
    }

    private boolean checkGameOver() {
        // 모든 플레이어의 점수판에 -1이 하나라도 있으면 게임 안 끝남
        for (Integer[] board : scoreBoards.values()) {
            for (int score : board) {
                if (score == -1) return false;
            }
        }
        return true;
    }

    private GameMessage finishGame() {
        this.playing = false;

        String winner = "";
        int maxScore = -1;

        for (String pid : scoreBoards.keySet()) {
            Integer[] board = scoreBoards.get(pid);
            int total = 0;
            int subTotalTop = 0; // 상단(1~6) 점수 합계

            for (int i = 0; i < 12; i++) {
                int score = (board[i] == -1) ? 0 : board[i];
                total += score;
                // 0~5 인덱스는 Ones ~ Sixes
                if (i <= 5) subTotalTop += score;
            }

            // [핵심] 보너스 점수 규칙 적용
            if (subTotalTop >= 63) {
                total += 35;
            }

            if (total > maxScore) {
                maxScore = total;
                if (users.containsKey(pid)) {
                    winner = users.get(pid).getNickname();
                } else {
                    winner = "Unknown";
                }
            }
        }

        Map<String, Object> dataMap = new HashMap<>();
        dataMap.put("winnerName", winner);
        dataMap.put("scoreBoards", scoreBoards);

        GameMessage msg = new GameMessage();
        msg.setType("GAME_OVER");
        msg.setRoomId(this.roomId);
        msg.setContent("게임 종료! 승자: " + winner + " (" + maxScore + "점)");
        msg.setData(dataMap);

        return msg;
    }

    private GameMessage makeStateMessage(String type, String content) {
        GameMessage msg = new GameMessage();
        msg.setType(type);
        msg.setRoomId(this.roomId);
        msg.setContent(content);
        Map<String, String> playerNames = new HashMap<>();
        for (Map.Entry<String, Player> entry : users.entrySet()) {
            playerNames.put(entry.getKey(), entry.getValue().getNickname());
        }
        msg.setData(Map.of(
                "dice", dice,
                "kept", kept,
                "rollCount", rollCount,
                "currentTurnId", currentTurnId != null ? currentTurnId : "",
                "scoreBoards", scoreBoards,
                "playerNames" , playerNames
        ));
        return msg;
    }
}