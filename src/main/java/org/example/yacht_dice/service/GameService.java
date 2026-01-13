package org.example.yacht_dice.service;

import lombok.RequiredArgsConstructor;
import org.example.common.service.ScoreSender;
import org.example.yacht_dice.dto.BaseGameRoom;
import org.example.yacht_dice.dto.GameMessage;
import org.example.yacht_dice.dto.Player;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class GameService {
    private final RoomService roomService;
    private final SimpMessagingTemplate messagingTemplate;
    private final ScoreSender scoreSender;
    // 입장 처리
    public void join(String roomId, GameMessage message) {
        BaseGameRoom room = roomService.findRoom(roomId);
        if (room == null) return;

        Player newPlayer = new Player(message.getSender(), message.getSenderId());

        if (message.getData() != null && message.getData().containsKey("dbUsername")) {
            String realId = (String) message.getData().get("dbUsername");

            if (realId != null && !realId.equals("null") && !realId.isEmpty()) {
                newPlayer.setDbUsername(realId);
                System.out.println("✅ 로그인 유저 입장: " + newPlayer.getNickname() + " (" + realId + ")");
            }
        }

        room.enterUser(newPlayer);

        message.setType("JOIN");
        message.setContent(message.getSender() + "님이 입장하셨습니다.");
        broadcast(roomId, message);

        // ... (기존 broadcast 코드) ...

        // [Tip] 실제 구현 시 주석 해제: 기존 유저 정보를 신규 유저에게 동기화
//        for (Player p : room.getUsers().values()) {
//            if (p.getId().equals(message.getSenderId())) continue; // 나 자신 제외
//
//            GameMessage syncMsg = GameMessage.builder()
//                    .type("JOIN")
//                    .sender(p.getNickname())
//                    .senderId(p.getId())
//                    // Player의 attributes나 skinUrl을 data에 담아서 전송
//                    .data(Map.of("semple", "semple"))
//                    .build();
//
//            messagingTemplate.convertAndSend("/topic/" + roomId, syncMsg);
//        }

        if (room instanceof org.example.yacht_dice.dto.YachtRoom) { // 형변환 안전하게 체크
            org.example.yacht_dice.dto.YachtRoom yachtRoom = (org.example.yacht_dice.dto.YachtRoom) room;

            GameMessage syncMsg = new GameMessage();
            syncMsg.setType("SYNC"); // 클라이언트 handleMessage가 처리할 수 있게
            syncMsg.setRoomId(roomId);
            syncMsg.setData(yachtRoom.getGameSnapshot());

            broadcast(roomId, syncMsg);
        }
    }

    // 게임 행동 처리 (핵심)
    public void handleGameAction(String roomId, GameMessage message) {
        BaseGameRoom room = roomService.findRoom(roomId);
        if (room == null) return;

        GameMessage result = room.handleAction(message);

        if (result != null) {
            if(result.getType().equals("GAME_OVER")){
                System.out.println(room.getUsers().values());
                endGame(roomId, new ArrayList<>(room.getUsers().values()));
            }
            broadcast(roomId, result);

        }
    }

    public void chat(String roomId, GameMessage message) {
        // 정답 체크 로직이 필요하면 여기서 room.checkAnswer() 등을 호출 가능
        broadcast(roomId, message);
    }

    public void exit(String roomId, GameMessage message) {
        BaseGameRoom room = roomService.findRoom(roomId);
        if (room != null) {
            room.exitUser(message.getSenderId());
            if (room.getUsers().isEmpty()) {
                roomService.deleteRoom(roomId);
            } else {
                broadcast(roomId, message);
            }
        }
    }
    public void endGame(String roomId, List<Player> players) {

        for (Player player : players) {
            // 1. 비회원(dbUsername이 없음)이면 점수 저장 패스
            if (player.getDbUsername() == null) {
                System.out.println("비회원 플레이어 점수 저장 건너뜀: " + player.getNickname());
                continue;
            }

            int totalScore = roomService.findRoom(roomId).getTotalScore(player.getId());

            scoreSender.sendScore(
                    player.getDbUsername(), // 여기가 중요합니다!
                    "Yacht_Dice",
                    totalScore,
                    true
            );
        }
    }
    private void broadcast(String roomId, GameMessage message) {
        messagingTemplate.convertAndSend("/topic/" + roomId, message);
    }
}