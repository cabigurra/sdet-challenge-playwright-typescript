import json
import os

from flask import Flask, jsonify, request

AUTH_TOKEN = os.getenv("AUTH_TOKEN", "mysecrettoken")

app = Flask(__name__)
app.json.compact = False  # pretty-print responses, like the original application

DATABASES = {"dev": {}, "prod": {}}


def db_for(env):
    return DATABASES.get(env)


def bad_request(message):
    return jsonify({"error": message}), 400


def server_error():
    return jsonify({"error": "Internal server error"}), 500


def parse_json_body():
    """Return (value, False) or (None, True) when the body is missing/not JSON."""
    raw = request.get_data()
    if not raw.strip():
        return None, True
    try:
        value = json.loads(raw)
    except ValueError:
        return None, True
    # A bare `null` body is reported as invalid by the original application.
    return (None, True) if value is None else (value, False)


def validate(body):
    if not body.get("name"):
        return "name is required"
    if not body.get("email"):
        return "email is required"
    if "age" not in body:
        return "age is required"
    age = body["age"]
    # NOTE: `type(...) is int` rejects bools and floats as well.
    if type(age) is not int or not 1 <= age <= 150:
        return "Age must be between 1 and 150"
    return None


def user(name, email, age):
    # Flask sorts object keys, so this serialises as age, email, name — matching
    # the field order of the original application.
    return {"name": name, "email": email, "age": age}


@app.get("/<env>/users")
def list_users(env):
    db = db_for(env)
    if db is None:
        return jsonify({"error": "Not found"}), 404
    return jsonify(list(db.values())), 200


@app.post("/<env>/users")
def create_user(env):
    db = db_for(env)
    if db is None:
        return jsonify({"error": "Not found"}), 404

    body, invalid = parse_json_body()
    if invalid:
        return bad_request("Invalid JSON body")
    if not isinstance(body, dict):
        return server_error()

    problem = validate(body)
    if problem:
        return bad_request(problem)

    # BUG-02: a duplicate email should return 409 but surfaces as an unhandled error.
    if body["email"] in db:
        return server_error()

    # BUG-03: no email format validation, so malformed addresses are accepted with 201.
    created = user(body["name"], body["email"], body["age"])
    db[body["email"]] = created
    return jsonify(created), 201


@app.get("/<env>/users/<email>")
def get_user(env, email):
    db = db_for(env)
    if db is None:
        return jsonify({"error": "Not found"}), 404

    existing = db.get(email)
    # BUG-01: an unknown email should return 404 but surfaces as a server error.
    if existing is None:
        return server_error()
    return jsonify(existing), 200


@app.put("/<env>/users/<email>")
def update_user(env, email):
    db = db_for(env)
    if db is None:
        return jsonify({"error": "Not found"}), 404

    body, invalid = parse_json_body()
    if invalid:
        return bad_request("Invalid JSON body")
    if not isinstance(body, dict):
        return server_error()

    problem = validate(body)
    if problem:
        return bad_request(problem)

    if email not in db:
        return jsonify({"error": "User not found"}), 404
    if body["email"] != email and body["email"] in db:
        return jsonify({"error": "Email already exists"}), 409

    # Quirk of the original app: PUT never persists anything — it validates the
    # request and echoes it back with 200, leaving the stored record untouched.
    return jsonify(user(body["name"], body["email"], body["age"])), 200


@app.delete("/<env>/users/<email>")
def delete_user(env, email):
    db = db_for(env)
    if db is None:
        return jsonify({"error": "Not found"}), 404

    # BUG-04: dev skips the authentication check entirely; prod enforces it.
    if env == "prod" and request.headers.get("Authentication") != AUTH_TOKEN:
        return jsonify({"error": "Authentication required"}), 401

    if email not in db:
        return jsonify({"error": "User not found"}), 404

    db.pop(email)
    return "", 204


@app.errorhandler(404)
def not_found(_error):
    # Quirk of the original app: an unmatched route is reported as a server
    # error, not as a 404. (Unknown environments still return 404 above.)
    return server_error()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "3000")))
