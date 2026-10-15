package com.example.api;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class UserController {

    private static final String AUTH_TOKEN =
            System.getenv().getOrDefault("AUTH_TOKEN", "mysecrettoken");
    private static final String[] REQUIRED_FIELDS = {"name", "email", "age"};

    private final ObjectMapper mapper = new ObjectMapper();
    private final Map<String, Map<String, Map<String, Object>>> databases = new ConcurrentHashMap<>();

    public UserController() {
        databases.put("dev", new ConcurrentHashMap<>());
        databases.put("prod", new ConcurrentHashMap<>());
    }

    private static Map<String, Object> error(String message) {
        return Map.of("error", message);
    }

    private static ResponseEntity<Object> body(HttpStatus status, Map<String, Object> payload) {
        return new ResponseEntity<>(payload, status);
    }

    private Map<String, Map<String, Object>> dbFor(String env) {
        return databases.get(env);
    }

    private static Map<String, Object> user(String name, String email, int age) {
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("name", name);
        user.put("email", email);
        user.put("age", age);
        return user;
    }

    private String validate(JsonNode node) {
        if (node == null || !node.isObject()) {
            return "Request body must be a JSON object";
        }
        for (String field : REQUIRED_FIELDS) {
            if (!node.has(field) || node.get(field).isNull()) {
                return "Missing required field: " + field;
            }
        }
        if (!node.get("name").isTextual()) {
            return "name must be a string";
        }
        if (!node.get("email").isTextual()) {
            return "email must be a string";
        }
        JsonNode age = node.get("age");
        if (!age.isNumber() || !age.isIntegralNumber() || age.asInt() < 1 || age.asInt() > 150) {
            return "age must be an integer between 1 and 150";
        }
        return null;
    }

    private JsonNode parse(String raw) throws JsonProcessingException {
        return raw == null || raw.isBlank() ? null : mapper.readTree(raw);
    }

    @GetMapping("/{env}/users")
    public ResponseEntity<Object> listUsers(@PathVariable String env) {
        Map<String, Map<String, Object>> db = dbFor(env);
        if (db == null) {
            return body(HttpStatus.NOT_FOUND, error("Not found"));
        }
        return ResponseEntity.ok(new java.util.ArrayList<>(db.values()));
    }

    @PostMapping("/{env}/users")
    public ResponseEntity<Object> createUser(@PathVariable String env, @RequestBody(required = false) String raw) {
        Map<String, Map<String, Object>> db = dbFor(env);
        if (db == null) {
            return body(HttpStatus.NOT_FOUND, error("Not found"));
        }

        JsonNode node;
        try {
            node = parse(raw);
        } catch (JsonProcessingException ex) {
            return body(HttpStatus.BAD_REQUEST, error("Validation error: malformed JSON body"));
        }

        String problem = validate(node);
        if (problem != null) {
            return body(HttpStatus.BAD_REQUEST, error("Validation error: " + problem));
        }

        String name = node.get("name").asText();
        String email = node.get("email").asText();
        int age = node.get("age").asInt();

        // BUG-02: a duplicate email should return 409 but surfaces as an unhandled error.
        if (db.containsKey(email)) {
            return body(HttpStatus.INTERNAL_SERVER_ERROR, error("Internal server error"));
        }

        // BUG-03: no email format validation, so malformed addresses are accepted with 201.
        Map<String, Object> user = user(name, email, age);
        db.put(email, user);
        return body(HttpStatus.CREATED, user);
    }

    @GetMapping("/{env}/users/{email}")
    public ResponseEntity<Object> getUser(@PathVariable String env, @PathVariable String email) {
        Map<String, Map<String, Object>> db = dbFor(env);
        if (db == null) {
            return body(HttpStatus.NOT_FOUND, error("Not found"));
        }

        Map<String, Object> user = db.get(email);
        // BUG-01: an unknown email should return 404 but surfaces as a server error.
        if (user == null) {
            return body(HttpStatus.INTERNAL_SERVER_ERROR, error("Internal server error"));
        }
        return ResponseEntity.ok(user);
    }

    @PutMapping("/{env}/users/{email}")
    public ResponseEntity<Object> updateUser(
            @PathVariable String env, @PathVariable String email, @RequestBody(required = false) String raw) {
        Map<String, Map<String, Object>> db = dbFor(env);
        if (db == null) {
            return body(HttpStatus.NOT_FOUND, error("Not found"));
        }

        JsonNode node;
        try {
            node = parse(raw);
        } catch (JsonProcessingException ex) {
            return body(HttpStatus.BAD_REQUEST, error("Validation error: malformed JSON body"));
        }

        String problem = validate(node);
        if (problem != null) {
            return body(HttpStatus.BAD_REQUEST, error("Validation error: " + problem));
        }

        if (!db.containsKey(email)) {
            return body(HttpStatus.NOT_FOUND, error("User not found"));
        }

        String name = node.get("name").asText();
        String newEmail = node.get("email").asText();
        int age = node.get("age").asInt();

        if (!newEmail.equals(email) && db.containsKey(newEmail)) {
            return body(HttpStatus.CONFLICT, error("User with this email already exists"));
        }

        if (!newEmail.equals(email)) {
            db.remove(email);
        }
        Map<String, Object> user = user(name, newEmail, age);
        db.put(newEmail, user);
        return ResponseEntity.ok(user);
    }

    @DeleteMapping("/{env}/users/{email}")
    public ResponseEntity<Object> deleteUser(
            @PathVariable String env,
            @PathVariable String email,
            @RequestHeader(value = "Authentication", required = false) String authentication) {
        Map<String, Map<String, Object>> db = dbFor(env);
        if (db == null) {
            return body(HttpStatus.NOT_FOUND, error("Not found"));
        }

        // BUG-04: dev skips the authentication check entirely; prod enforces it.
        if ("prod".equals(env) && !AUTH_TOKEN.equals(authentication)) {
            return body(HttpStatus.UNAUTHORIZED, error("Authentication required"));
        }

        if (!db.containsKey(email)) {
            return body(HttpStatus.NOT_FOUND, error("User not found"));
        }

        db.remove(email);
        return ResponseEntity.noContent().build();
    }
}
