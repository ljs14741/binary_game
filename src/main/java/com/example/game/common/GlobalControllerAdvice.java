package com.example.game.common;

import com.example.game.dto.VisitorDTO;
import com.example.game.service.VisitorService;
import lombok.RequiredArgsConstructor;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;

@ControllerAdvice
@RequiredArgsConstructor
public class GlobalControllerAdvice {

    private final VisitorService visitorService;

    @ModelAttribute
    public void addAttributes(Model model) {
        // visitorDTO는 서비스나 저장소를 통해 가져오는 값이어야 함

        VisitorDTO visitorDTO = visitorService.getVisitorCount();
        model.addAttribute("dailyCount", visitorDTO.getDailyCount());
        model.addAttribute("totalCount", visitorDTO.getTotalCount());
    }
}
