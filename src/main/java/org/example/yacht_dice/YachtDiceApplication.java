package org.example.yacht_dice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;

@SpringBootApplication
@ComponentScan(basePackages = {"org.example.yacht_dice", "org.example.common"})
public class YachtDiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(YachtDiceApplication.class, args);
    }

}
