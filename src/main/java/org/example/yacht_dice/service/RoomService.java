package org.example.yacht_dice.service;

import org.example.yacht_dice.dto.BaseGameRoom;
import org.example.yacht_dice.dto.YachtRoom;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RoomService {
    private final Map<String, YachtRoom> rooms = new ConcurrentHashMap<>();

    // RoomService.java
    public YachtRoom createRoom(String name) {
        YachtRoom room = new YachtRoom(name); // 여기 수정
        rooms.put(room.getRoomId(), room);
        return room;
    }

    public YachtRoom findRoom(String roomId) {
        return rooms.get(roomId);
    }

    public List<YachtRoom> findAll() {
        return new ArrayList<>(rooms.values());
    }

    public void deleteRoom(String roomId) {
        rooms.remove(roomId);
    }
}