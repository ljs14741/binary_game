package com.example.game.common;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Value("${file.upload-dir}")
    private String uploadDir;

    private final Environment env;

    public WebMvcConfig(Environment env) {
        this.env = env;
    }

    /** 언어는 주소(/en/...)가 정한다. 빈 이름이 localeResolver 여야 스프링 MVC 가 집어 간다. */
    @Bean
    public LocaleResolver localeResolver() {
        return new PathLocaleResolver();
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String resourceLocation = "file:" + uploadDir;
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations(resourceLocation);
    }
}