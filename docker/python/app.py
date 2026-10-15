import os

from flask import Flask, jsonify, request

AUTH_TOKEN = os.getenv("AUTH_TOKEN", "mysecrettoken")

app = Flask(__name__)

DATABASES = {"dev": {}, "prod": {}}

REQUIRED_FIELDS = ("name", "email", "age")


def validation_error(message):
    return jsonify({"error": f"Validation error: {message}"}), 400


def validate_user_body(body):
    if not isinstance(body, dict):
        return "Request body must be a JSON object"
    for field in REQUIRED_FIELDS:
        if field not in body or body[field] is None:
            return f"Missing required field: {field}"
    if not isinstance(body["name"], str):
        return "name must be a string"
    if not isinstance(body["email"], str):
        return "email must be a string"
    # NOTE: `type(...) is int` rejects bools and floats as well.
    if type(body["age"]) is not int or not 1 <= body["age"] <= 150:
        return "age must be an integer between 1 and 150"
    return None


def db_for(env):
    return DATABASES.get(env)


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

    body = request.get_json(silent=True)
    problem = validate_user_body(body)
    if problem:
        return validation_error(problem)

    name, email, age = body["name"], body["email"], body["age"]

    # BUG-02: a duplicate email should return 409 but surfaces as an unhandled error.
    if email in db:
        return jsonify({"error": "Internal server error"}), 500

    # BUG-03: no email format validation, so malformed addresses are accepted with 201.
    user = {"name": name, "email": email, "age": age}
    db[email] = user
    return jsonify(user), 201


@app.get("/<env>/users/<email>")
def get_user(env, email):
    db = db_for(env)
    if db is None:
        return jsonify({"error": "Not found"}), 404

    user = db.get(email)
    # BUG-01: an unknown email should return 404 but surfaces as a server error.
    if user is None:
        return jsonify({"error": "Internal server error"}), 500
    return jsonify(user), 200


@app.put("/<env>/users/<email>")
def update_user(env, email):
    db = db_for(env)
    if db is None:
        return jsonify({"error": "Not found"}), 404

    body = request.get_json(silent=True)
    problem = validate_user_body(body)
    if problem:
        return validation_error(problem)

    if email not in db:
        return jsonify({"error": "User not found"}), 404

    new_email = body["email"]
    if new_email != email and new_email in db:
        return jsonify({"error": "User with this email already exists"}), 409

    if new_email != email:
        db.pop(email, None)
    user = {"name": body["name"], "email": new_email, "age": body["age"]}
    db[new_email] = user
    return jsonify(user), 200


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
    return jsonify({"error": "Not found"}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "3000")))
