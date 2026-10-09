from database import get_connection
from hashlib import pbkdf2_hmac
import binascii
import secrets


PASSWORD = "LogiAid@1618"


def create_password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)

    password_hash = pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        120000,
    )

    return (
        binascii.hexlify(salt).decode()
        + "$"
        + binascii.hexlify(password_hash).decode()
    )


def verify_password(password: str, stored_password: str) -> bool:
    try:
        salt_hex, hash_hex = stored_password.split("$")

        salt = binascii.unhexlify(salt_hex)

        new_hash = pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            120000,
        )

        return (
            binascii.hexlify(new_hash).decode()
            == hash_hex
        )

    except Exception:
        return False


connection = get_connection()
cursor = connection.cursor()

new_hash = create_password_hash(PASSWORD)

cursor.execute(
    """
    UPDATE users
    SET password_hash = %s
    WHERE username = %s
    RETURNING id, username, role, password_hash
    """,
    (new_hash, "operator"),
)

row = cursor.fetchone()

if row is None:
    print("ERROR: operator account was NOT found.")

else:
    connection.commit()

    print()
    print("========================================")
    print("OPERATOR PASSWORD RESET SUCCESS")
    print("========================================")
    print("ID       :", row[0])
    print("Username :", row[1])
    print("Role     :", row[2])
    print("Password :", PASSWORD)
    print()
    print("HASH VERIFICATION:", verify_password(PASSWORD, row[3]))
    print("========================================")

cursor.close()
connection.close()