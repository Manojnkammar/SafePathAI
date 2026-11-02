import base64
import hashlib
import hmac
import secrets


_PASSWORD_SCHEME = "pbkdf2_sha256"
_PASSWORD_ITERATIONS = 600_000


def hash_password(password: str) -> str:
	salt = secrets.token_bytes(16)
	digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PASSWORD_ITERATIONS)
	salt_text = base64.urlsafe_b64encode(salt).decode("ascii").rstrip("=")
	digest_text = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
	return f"{_PASSWORD_SCHEME}${_PASSWORD_ITERATIONS}${salt_text}${digest_text}"


def verify_password(password: str, encoded_hash: str | None) -> bool:
	if not encoded_hash:
		return False
	try:
		scheme, iterations_text, salt_text, digest_text = encoded_hash.split("$", 3)
		iterations = int(iterations_text)
		if scheme != _PASSWORD_SCHEME or not 100_000 <= iterations <= 1_000_000:
			return False
		salt = base64.urlsafe_b64decode(salt_text + "=" * (-len(salt_text) % 4))
		expected = base64.urlsafe_b64decode(digest_text + "=" * (-len(digest_text) % 4))
		actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
	except (ValueError, TypeError):
		return False
	return hmac.compare_digest(actual, expected)
