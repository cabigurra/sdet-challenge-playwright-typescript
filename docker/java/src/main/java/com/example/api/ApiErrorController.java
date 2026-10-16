package com.example.api;

import java.util.LinkedHashMap;
import java.util.Map;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectWriter;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.boot.web.servlet.error.ErrorController;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Replaces Spring Boot's default {@code BasicErrorController}.
 *
 * <p>Quirk of the original application: an unmatched route (and any other
 * framework-level error) is reported as {@code 500 Internal server error}, not
 * as a 404. Declaring a bean of type {@link ErrorController} disables the
 * default controller, so every error dispatch is answered here.
 */
@RestController
public class ApiErrorController implements ErrorController {

    private final ObjectWriter writer;

    public ApiErrorController(ObjectWriter writer) {
        this.writer = writer;
    }

    @RequestMapping("/error")
    public ResponseEntity<String> handle(HttpServletRequest request) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("error", "Internal server error");
        try {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(writer.writeValueAsString(payload) + "\n");
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
