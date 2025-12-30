package org.example.yacht_dice.controller;

import lombok.RequiredArgsConstructor;
import org.example.yacht_dice.dto.BaseGameRoom;
import org.example.yacht_dice.service.RoomService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/rooms")
@RequiredArgsConstructor
public class RoomController {
    private final RoomService roomService;

    @RequestMapping(method = RequestMethod.HEAD)
    public void healthCheck() {
    }

    // 1. 방 목록 조회 (GET /api/rooms)
    @GetMapping
    public List<BaseGameRoom> findAllRooms() {
        return roomService.findAll();
    }

    // 2. 방 생성 (POST /api/rooms?name=...)
    @PostMapping
    public BaseGameRoom createRoom(@RequestParam String name) {
        return roomService.createRoom(name);
    }

    // 3. 특정 방 조회 (GET /api/rooms/{roomId})
    @GetMapping("/{roomId}")
    public BaseGameRoom getRoom(@PathVariable String roomId) {
        return roomService.findRoom(roomId);
    }
}