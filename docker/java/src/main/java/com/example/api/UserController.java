package com.example.api;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectWriter;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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

    private final ObjectMapper mapper = new ObjectMapper();
    private final ObjectWriter writer;
    private final Map<String, Map<String, Map<String, Object>>> databases = new ConcurrentHashMap<>();

    public UserController(ObjectWriter writer) {
        this.writer = writer;
        databases.put("dev", new ConcurrentHashMap<>());
        databases.put("prod", new ConcurrentHashMap<>());
    }

    /**
     * Serialises the body with the shared pretty printer and appends a trailing
     * newline, so responses are byte-identical to the original application.
     */
    private ResponseEntity<String> json(Object value, HttpStatus status) {
        try {
            String body = writer.writeValueAsString(value) + "\n";
            return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(body);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static Map<String, Object> error(String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("error", message);
        return payload;
    }

    private ResponseEntity<String> badRequest(String message) {
        return json(error(message), HttpStatus.BAD_REQUEST);
    }

    private ResponseEntity<String> serverError() {
        return json(error("Internal server error"), HttpStatus.INTERNAL_SERVER_ERROR);
    }

    private Map<String, Map<String, Object>> dbFor(String env) {
        return databases.get(env);
    }

    /**
     * Serialised in the same field order as the original application: age, email, name.
     */
    private static Map<String, Object> user(Object name, Object email, Object age) {
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("age", age);
        user.put("email", email);
        user.put("name", name);
        return user;
    }

    private static boolean isFalsy(JsonNode node) {
        if (node == null || node.isNull()) return true;
        if (node.isTextual()) return node.asText().isEmpty();
        if (node.isNumber()) return node.asDouble() == 0.0;
        if (node.isBoolean()) return !node.asBoolean();
        return false;
    }

    private String validate(JsonNode node) {
        if (isFalsy(node.get("name"))) return "name is required";
        if (isFalsy(node.get("email"))) return "email is required";
        if (!node.has("age")) return "age is required";
        JsonNode age = node.get("age");
        if (!age.isIntegralNumber() || age.asInt() < 1 || age.asInt() > 150) {
            return "Age must be between 1 and 150";
        }
        return null;
    }

    /**
     * Parses the raw request body. Returns null when the body is missing, is not
     * valid JSON, or is a bare `null` (all answered with 400 "Invalid JSON body").
     */
    private JsonNode parseOrFail(String raw) throws JsonProcessingException {
        if (raw == null || raw.isBlank()) return null;
        JsonNode node = mapper.readTree(raw);
        return node.isNull() ? null : node;
    }

    @GetMapping("/{env}/users")
    public ResponseEntity<String> listUsers(@PathVariable String env) {
        Map<String, Map<String, Object>> db = dbFor(env);
        if (db == null) {
            return json(error("Not found"), HttpStatus.NOT_FOUND);
        }
        return json(new ArrayList<Map<String, Object>>(db.values()), HttpStatus.OK);
    }

    @PostMapping("/{env}/users")
    public ResponseEntity<String> createUser(@PathVariable String env, @RequestBody(required = false) String raw) {
        Map<String, Map<String, Object>> db = dbFor(env);
        if (db == null) {
            return json(error("Not found"), HttpStatus.NOT_FOUND);
        }

        JsonNode node;
        try {
            node = parseOrFail(raw);
        } catch (JsonProcessingException ex) {
            return badRequest("Invalid JSON body");
        }
        if (node == null) return badRequest("Invalid JSON body");
        if (!node.isObject()) return serverError();

        String problem = validate(node);
        if (problem != null) return badRequest(problem);

        String emailKey = node.get("email").asText();

        // BUG-02: a duplicate email should return 409 but surfaces as an unhandled error.
        if (db.containsKey(emailKey)) return serverError();

        // BUG-03: no email format validation, so malformed addresses are accepted with 201.
        Map<String, Object> created = value(node);
        db.put(emailKey, created);
        return json(created, HttpStatus.CREATED);
    }

    @GetMapping("/{env}/users/{email}")
    public ResponseEntity<String> getUser(@PathVariable String env, @PathVariable String email) {
        Map<String, Map<String, Object>> db = dbFor(env);
        if (db == null) {
            return json(error("Not found"), HttpStatus.NOT_FOUND);
        }

        Map<String, Object> existing = db.get(email);
        // BUG-01: an unknown email should return 404 but surfaces as a server error.
        if (existing == null) return serverError();
        return json(existing, HttpStatus.OK);
    }

    @PutMapping("/{env}/users/{email}")
    public ResponseEntity<String> updateUser(
            @PathVariable String env, @PathVariable String email, @RequestBody(required = false) String raw) {
        Map<String, Map<String, Object>> db = dbFor(env);
        if (db == null) {
            return json(error("Not found"), HttpStatus.NOT_FOUND);
        }

        JsonNode node;
        try {
            node = parseOrFail(raw);
        } catch (JsonProcessingException ex) {
            return badRequest("Invalid JSON body");
        }
        if (node == null) return badRequest("Invalid JSON body");
        if (!node.isObject()) return serverError();

        String problem = validate(node);
        if (problem != null) return badRequest(problem);

        if (!db.containsKey(email)) {
            return json(error("User not found"), HttpStatus.NOT_FOUND);
        }

        String newEmail = node.get("email").asText();
        if (!newEmail.equals(email) && db.containsKey(newEmail)) {
            return json(error("Email already exists"), HttpStatus.CONFLICT);
        }

        // Quirk of the original app: PUT never persists anything — it validates the
        // request and echoes it back with 200, leaving the stored record untouched.
        return json(value(node), HttpStatus.OK);
    }

    @DeleteMapping("/{env}/users/{email}")
    public ResponseEntity<String> deleteUser(
            @PathVariable String env,
            @PathVariable String email,
            @RequestHeader(value = "Authentication", required = false) String authentication) {
        Map<String, Map<String, Object>> db = dbFor(env);
        if (db == null) {
            return json(error("Not found"), HttpStatus.NOT_FOUND);
        }

        // BUG-04: dev skips the authentication check entirely; prod enforces it.
        if ("prod".equals(env) && !AUTH_TOKEN.equals(authentication)) {
            return json(error("Authentication required"), HttpStatus.UNAUTHORIZED);
        }

        if (!db.containsKey(email)) {
            return json(error("User not found"), HttpStatus.NOT_FOUND);
        }

        db.remove(email);
        return ResponseEntity.noContent().build();
    }

    /** Builds the response body from the request payload, preserving value types. */
    private Map<String, Object> value(JsonNode node) {
        return user(
                mapper.convertValue(node.get("name"), Object.class),
                mapper.convertValue(node.get("email"), Object.class),
                mapper.convertValue(node.get("age"), Object.class));
    }
}
