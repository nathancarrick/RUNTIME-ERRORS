import os
import binascii
import hashlib
from hashlib import pbkdf2_hmac
import json
from os import urandom
from pathlib import Path
import secrets
import smtplib
from email.mime.text import MIMEText
import uuid
import httpx

from fastapi import FastAPI, HTTPException, Header, Query, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from database import get_connection
from logic import (
    analyze_disruption,
    recalculate_with_urgency,
    validate_driver_route,
    evaluate_fair_priority,
    rank_priority_queue,
    match_recovery_vehicle,
)

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads" / "profiles"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

APP_ENV = os.getenv("APP_ENV", "development")
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587")) if os.getenv("SMTP_PORT") else 587
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "")
SMS_PROVIDER = os.getenv("SMS_PROVIDER", "")
SMS_API_KEY = os.getenv("SMS_API_KEY", "")
NOMINATIM_USER_AGENT = os.getenv("NOMINATIM_USER_AGENT", "LOGIAID/1.0")
OSRM_BASE_URL = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org").rstrip("/")
NOMINATIM_BASE_URL = os.getenv("NOMINATIM_BASE_URL", "https://nominatim.openstreetmap.org").rstrip("/")
MAX_PROFILE_IMAGE_MB = int(os.getenv("MAX_PROFILE_IMAGE_MB", "3"))


def log_shipment_event(
    cursor,
    shipment_code: str,
    event_type: str,
    description: str,
    created_by: str = "SYSTEM",
):
    try:
        cursor.execute(
            """
            INSERT INTO shipment_events (shipment_id, shipment_code, event_type, description, created_by)
            SELECT id, %s, %s, %s, %s FROM shipments WHERE shipment_code = %s;
            """,
            (shipment_code, event_type, description, created_by, shipment_code),
        )
    except Exception as exc:
        print(f"Warning: Failed to log shipment event {event_type} for {shipment_code}: {exc}")


def create_customer_notification(
    cursor,
    customer_id: int | None,
    shipment_code: str,
    title: str,
    message: str,
    notification_type: str,
    updated_eta: str = None,
    action_required: bool = False,
):
    try:
        if not customer_id:
            cursor.execute(
                "SELECT customer_id FROM shipments WHERE shipment_code = %s LIMIT 1;",
                (shipment_code,),
            )
            row = cursor.fetchone()
            if row and row[0]:
                customer_id = row[0]
            else:
                return

        cursor.execute(
            """
            INSERT INTO customer_notifications
            (customer_id, shipment_code, title, message, notification_type, updated_eta, action_required, is_read)
            VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE);
            """,
            (customer_id, shipment_code, title, message, notification_type, updated_eta, action_required),
        )
    except Exception as exc:
        print(f"Warning: Failed to create customer notification for {shipment_code}: {exc}")


def log_security_event(
    cursor,
    user_id: int | None,
    event_type: str,
    description: str,
    ip_address: str | None = None,
):
    try:
        cursor.execute(
            """
            INSERT INTO security_events (user_id, event_type, description, ip_address, created_at)
            VALUES (%s, %s, %s, %s, NOW());
            """,
            (user_id, event_type, description, ip_address),
        )
    except Exception as exc:
        print(f"Warning: Failed to log security event {event_type}: {exc}")


def mask_target(target: str, channel: str) -> str:
    if not target:
        return ""
    if channel.upper() == "EMAIL" and "@" in target:
        parts = target.split("@", 1)
        name, domain = parts[0], parts[1]
        if len(name) <= 2:
            masked = name[0] + "***"
        else:
            masked = name[0] + "***" + name[-1]
        return f"{masked}@{domain}"
    elif channel.upper() == "SMS":
        digits = "".join(filter(str.isdigit, target))
        if len(digits) >= 6:
            return digits[:2] + "******" + digits[-2:]
        return target
    return target


def validate_image_bytes(data: bytes) -> str:
    if len(data) < 12:
        raise HTTPException(status_code=400, detail="File too small or corrupted")
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "webp"
    raise HTTPException(
        status_code=400,
        detail="Invalid image format. Only PNG, JPEG, and WebP are allowed."
    )


def send_email_otp(to_email: str, otp_code: str) -> bool:
    if not SMTP_HOST or not SMTP_USERNAME:
        print(f"[OTP DEV] Simulated email delivery to {to_email}: code {otp_code}")
        return False
    try:
        msg = MIMEText(
            f"Your LOGIAID verification code is: {otp_code}\n\n"
            f"This code will expire in 10 minutes.\n"
            f"If you did not request this, please secure your account immediately."
        )
        msg["Subject"] = "LOGIAID Verification Code"
        msg["From"] = SMTP_FROM_EMAIL or SMTP_USERNAME
        msg["To"] = to_email
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
        return True
    except Exception as exc:
        print(f"Warning: SMTP email delivery failed: {exc}")
        return False


def send_sms_otp(to_phone: str, otp_code: str) -> bool:
    if not SMS_API_KEY or not SMS_PROVIDER:
        print(f"[OTP DEV] Simulated SMS delivery to {to_phone}: code {otp_code}")
        return False
    return False


app = FastAPI(title="LOGIAID API")

# Static files for profile uploads
app.mount("/uploads", StaticFiles(directory=str(BASE_DIR / "uploads")), name="uploads")


# =========================================================
# CORS
# =========================================================

cors_env = os.getenv("FRONTEND_ORIGINS", "")
configured_origins = [o.strip() for o in cors_env.split(",") if o.strip()]
default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
all_origins = list(set(default_origins + configured_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=all_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# PASSWORD HASHING
# =========================================================

def hash_password(password: str) -> str:
    salt = urandom(16)

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


# =========================================================
# STRONG PASSWORD VALIDATION
# =========================================================

def validate_strong_password(password: str):

    if len(password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters long",
        )

    if not any(char.isupper() for char in password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one uppercase letter",
        )

    if not any(char.islower() for char in password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one lowercase letter",
        )

    if not any(char.isdigit() for char in password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one number",
        )

    if not any(not char.isalnum() for char in password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one special character",
        )


# =========================================================
# REQUEST MODELS
# =========================================================

class DisruptionRequest(BaseModel):
    shipment_id: str
    disruption_type: str
    severity: str
    location: str = ""
    description: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str
    role: str


class CustomerRegisterRequest(BaseModel):
    username: str
    password: str
    full_name: str
    email: str = ""
    phone: str = ""
    address: str = ""
    city: str = ""
    pincode: str = ""


class DriverCreateRequest(BaseModel):
    username: str
    password: str
    full_name: str
    email: str = ""
    phone: str = ""
    license_number: str = ""
    vehicle_number: str = ""
    vehicle_type: str = ""
    operator_username: str


class DriverResponseCreate(BaseModel):
    shipment_code: str
    driver_id: int
    response_type: str  # ACCEPTED, ISSUE_REPORTED, ROUTE_SUGGESTED
    recovery_plan_id: int | None = None
    issue_type: str | None = None
    severity: str | None = "MEDIUM"
    description: str | None = ""
    suggested_route: str | None = None
    reason: str | None = None
    estimated_improvement: str | None = None
    observed_road_condition: str | None = ""
    estimated_delay_minutes: int | None = 0
    driver_notes: str | None = ""
    proposed_waypoints: str | None = ""


class DriverResponseDecision(BaseModel):
    decision: str  # ACCEPT or REJECT
    operator_notes: str | None = ""


class CustomerUrgencyRequest(BaseModel):
    shipment_code: str
    customer_id: int
    message: str
    urgency_level: str | None = "HIGH"


class CompleteDeliveryRequest(BaseModel):
    shipment_code: str
    driver_id: int
    notes: str | None = ""


class ReevaluatePlanRequest(BaseModel):
    recovery_plan_id: int | None = None
    shipment_code: str | None = None
    reason: str | None = ""


class ShipmentClassificationUpdate(BaseModel):
    category: str
    deadline: str | None = None
    operator_username: str | None = "operator"
    verified_emergency: bool | None = False


class ForgotPasswordRequest(BaseModel):
    identifier: str
    delivery_channel: str = "EMAIL"


class VerifyOtpRequest(BaseModel):
    identifier: str
    otp: str


class ResetPasswordRequest(BaseModel):
    reset_token: str
    identifier: str | None = None
    new_password: str
    confirm_password: str


class ChangePasswordRequest(BaseModel):
    user_id: int
    current_password: str
    new_password: str
    confirm_password: str


class UpdateProfileRequest(BaseModel):
    user_id: int
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    preferred_notification_method: str | None = None
    availability_status: str | None = None



# =========================================================
# BASIC ROUTES
# =========================================================

@app.get("/")
def root():
    return {
        "message": "LOGIAID backend is running!"
    }


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "database": "logiaid"
    }


# =========================================================
# CUSTOMER REGISTRATION
# =========================================================

@app.post("/api/auth/customer/register")
def register_customer(
    data: CustomerRegisterRequest
):

    connection = None
    cursor = None

    try:

        # Strong password validation
        validate_strong_password(data.password)

        connection = get_connection()
        cursor = connection.cursor()

        # Check username
        cursor.execute(
            """
            SELECT id
            FROM users
            WHERE username = %s;
            """,
            (data.username,),
        )

        existing_user = cursor.fetchone()

        if existing_user:
            raise HTTPException(
                status_code=400,
                detail="Username already exists",
            )

        # Hash password
        password_hash = hash_password(
            data.password
        )

        # Create customer user
        cursor.execute(
            """
            INSERT INTO users
            (
                username,
                password_hash,
                role,
                full_name,
                email,
                phone
            )
            VALUES
            (
                %s,
                %s,
                'CUSTOMER',
                %s,
                %s,
                %s
            )
            RETURNING id;
            """,
            (
                data.username,
                password_hash,
                data.full_name,
                data.email,
                data.phone,
            ),
        )

        user_id = cursor.fetchone()[0]

        # Create customer profile
        cursor.execute(
            """
            INSERT INTO customer_profiles
            (
                user_id,
                address,
                city,
                pincode
            )
            VALUES
            (
                %s,
                %s,
                %s,
                %s
            );
            """,
            (
                user_id,
                data.address,
                data.city,
                data.pincode,
            ),
        )

        connection.commit()

        customer_id = f"CUS-{user_id:04d}"

        return {
            "success": True,
            "message": "Customer account created successfully",
            "customer_id": customer_id,
            "user_id": user_id,
            "username": data.username,
            "role": "CUSTOMER",
            "full_name": data.full_name,
        }

    except HTTPException:

        if connection:
            connection.rollback()

        raise

    except Exception as e:

        if connection:
            connection.rollback()

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )

    finally:

        if cursor:
            cursor.close()

        if connection:
            connection.close()


# =========================================================
# LOGIN
# =========================================================

@app.post("/api/auth/login")
def login(data: LoginRequest, request: Request = None):

    connection = None
    cursor = None

    try:

        role = data.role.upper()

        if role not in [
            "CUSTOMER",
            "DRIVER",
            "OPERATOR",
        ]:
            raise HTTPException(
                status_code=400,
                detail="Invalid role",
            )

        connection = get_connection()
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT
                id,
                username,
                password_hash,
                role,
                full_name,
                email,
                phone,
                active,
                profile_photo_path,
                state,
                preferred_notification_method,
                last_login
            FROM users
            WHERE username = %s
            AND role = %s;
            """,
            (
                data.username,
                role,
            ),
        )

        user = cursor.fetchone()

        if not user:
            raise HTTPException(
                status_code=401,
                detail="Invalid username or role",
            )

        (
            user_id,
            username,
            password_hash,
            user_role,
            full_name,
            email,
            phone,
            active,
            profile_photo_path,
            user_state,
            pref_notif,
            last_login,
        ) = user

        ip = request.client.host if request and request.client else None

        if not active:
            raise HTTPException(
                status_code=403,
                detail="Account is inactive",
            )

        if not verify_password(
            data.password,
            password_hash,
        ):
            log_security_event(cursor, user_id, "LOGIN_FAILED", f"Failed password attempt for {username}", ip)
            connection.commit()
            raise HTTPException(
                status_code=401,
                detail="Invalid password",
            )

        # Update last login and record event
        cursor.execute("UPDATE users SET last_login = NOW() WHERE id = %s;", (user_id,))
        log_security_event(cursor, user_id, "LOGIN_SUCCESS", f"User {username} successfully logged in as {user_role}", ip)
        connection.commit()

        if user_role == "CUSTOMER":
            user_code = f"CUS-{user_id:04d}"
        elif user_role == "DRIVER":
            user_code = f"DRV-{user_id:04d}"
        else:
            user_code = f"OPR-{user_id:04d}"

        response = {
            "success": True,
            "message": "Login successful",
            "user_id": user_id,
            "user_code": user_code,
            "username": username,
            "role": user_role,
            "full_name": full_name or "",
            "email": email or "",
            "phone": phone or "",
            "profile_photo_path": profile_photo_path,
            "state": user_state or "Tamil Nadu",
            "preferred_notification_method": pref_notif or "IN_APP",
            "last_login": last_login.isoformat() if last_login else None,
            "profile": {},
        }

        # Customer profile
        if user_role == "CUSTOMER":
            cursor.execute(
                """
                SELECT
                    address,
                    city,
                    pincode,
                    state
                FROM customer_profiles
                WHERE user_id = %s;
                """,
                (user_id,),
            )
            profile = cursor.fetchone()
            if profile:
                response["profile"] = {
                    "address": profile[0] or "",
                    "city": profile[1] or "",
                    "pincode": profile[2] or "",
                    "state": profile[3] or user_state or "Tamil Nadu",
                }

        # Driver profile
        elif user_role == "DRIVER":
            cursor.execute(
                """
                SELECT
                    license_number,
                    vehicle_number,
                    vehicle_type,
                    availability_status
                FROM driver_profiles
                WHERE user_id = %s;
                """,
                (user_id,),
            )
            profile = cursor.fetchone()
            if profile:
                response["profile"] = {
                    "license_number": profile[0] or "",
                    "vehicle_number": profile[1] or "",
                    "vehicle_type": profile[2] or "",
                    "availability_status": profile[3] or "AVAILABLE",
                }

        return response

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


# =========================================================
# FORGOT PASSWORD & OTP WORKFLOW
# =========================================================

@app.post("/api/auth/forgot-password/request-otp")
def request_password_reset_otp(data: ForgotPasswordRequest, request: Request = None):
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()

        identifier = data.identifier.strip()
        channel = (data.delivery_channel or "EMAIL").upper()
        if channel not in ["EMAIL", "SMS"]:
            channel = "EMAIL"

        cursor.execute(
            """
            SELECT id, username, email, phone, role
            FROM users
            WHERE LOWER(username) = LOWER(%s) OR LOWER(email) = LOWER(%s)
            LIMIT 1;
            """,
            (identifier, identifier),
        )
        user = cursor.fetchone()

        if not user:
            return {
                "success": True,
                "message": "If an active account exists with this identifier, a verification code has been dispatched.",
                "delivery_target": mask_target(identifier, channel),
                "delivery_channel": channel,
                "dev_otp_preview": None,
            }

        user_id, username, email, phone, role = user

        if channel == "SMS":
            target = phone or identifier
        else:
            target = email or identifier

        otp = f"{secrets.randbelow(900000) + 100000}"
        otp_hash = hashlib.sha256(otp.encode("utf-8")).hexdigest()

        cursor.execute(
            """
            UPDATE password_reset_otps
            SET is_used = TRUE
            WHERE user_id = %s AND purpose = 'PASSWORD_RESET' AND is_used = FALSE;
            """,
            (user_id,),
        )

        cursor.execute(
            """
            INSERT INTO password_reset_otps
            (user_id, otp_hash, purpose, delivery_target, delivery_channel, expires_at, attempts, max_attempts, is_used)
            VALUES (%s, %s, 'PASSWORD_RESET', %s, %s, NOW() + INTERVAL '10 minutes', 0, 5, FALSE);
            """,
            (user_id, otp_hash, target, channel),
        )

        ip = request.client.host if request and request.client else None
        log_security_event(cursor, user_id, "OTP_REQUESTED", f"Password reset OTP requested via {channel} for {username}", ip)
        connection.commit()

        delivered = False
        if channel == "EMAIL" and email:
            delivered = send_email_otp(email, otp)
        elif channel == "SMS" and phone:
            delivered = send_sms_otp(phone, otp)

        dev_preview = otp if (APP_ENV.lower() == "development" or not delivered) else None

        return {
            "success": True,
            "message": f"Verification code dispatched to {mask_target(target, channel)}",
            "delivery_target": mask_target(target, channel),
            "delivery_channel": channel,
            "dev_otp_preview": dev_preview,
        }

    except Exception as exc:
        if connection:
            connection.rollback()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.post("/api/auth/forgot-password/verify-otp")
def verify_password_reset_otp(data: VerifyOtpRequest, request: Request = None):
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()

        identifier = data.identifier.strip()
        otp = data.otp.strip()

        cursor.execute(
            """
            SELECT id, username FROM users
            WHERE LOWER(username) = LOWER(%s) OR LOWER(email) = LOWER(%s)
            LIMIT 1;
            """,
            (identifier, identifier),
        )
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=400, detail="Invalid verification request.")

        user_id, username = user
        ip = request.client.host if request and request.client else None

        cursor.execute(
            """
            SELECT id, otp_hash, expires_at, attempts, max_attempts, is_used
            FROM password_reset_otps
            WHERE user_id = %s AND purpose = 'PASSWORD_RESET' AND is_used = FALSE
            ORDER BY created_at DESC
            LIMIT 1;
            """,
            (user_id,),
        )
        record = cursor.fetchone()

        if not record:
            raise HTTPException(status_code=400, detail="No active verification code found. Please request a new code.")

        otp_id, stored_hash, expires_at, attempts, max_attempts, is_used = record

        if attempts >= max_attempts:
            cursor.execute("UPDATE password_reset_otps SET is_used = TRUE WHERE id = %s;", (otp_id,))
            log_security_event(cursor, user_id, "OTP_MAX_ATTEMPTS_EXCEEDED", f"Max OTP attempts exceeded for {username}", ip)
            connection.commit()
            raise HTTPException(status_code=400, detail="Maximum verification attempts exceeded. Please request a new code.")

        cursor.execute("SELECT NOW() > %s;", (expires_at,))
        is_expired = cursor.fetchone()[0]
        if is_expired:
            cursor.execute("UPDATE password_reset_otps SET is_used = TRUE WHERE id = %s;", (otp_id,))
            connection.commit()
            raise HTTPException(status_code=400, detail="Verification code has expired. Please request a new code.")

        input_hash = hashlib.sha256(otp.encode("utf-8")).hexdigest()
        if input_hash != stored_hash:
            new_attempts = attempts + 1
            cursor.execute("UPDATE password_reset_otps SET attempts = %s WHERE id = %s;", (new_attempts, otp_id))
            log_security_event(cursor, user_id, "OTP_VERIFICATION_FAILED", f"Invalid OTP entered for {username} (attempt {new_attempts}/{max_attempts})", ip)
            connection.commit()
            remaining = max(0, max_attempts - new_attempts)
            raise HTTPException(status_code=400, detail=f"Invalid verification code. {remaining} attempt(s) remaining.")

        reset_token = secrets.token_urlsafe(32)
        cursor.execute(
            """
            UPDATE password_reset_otps
            SET reset_token = %s, reset_token_expires_at = NOW() + INTERVAL '15 minutes'
            WHERE id = %s;
            """,
            (reset_token, otp_id),
        )
        log_security_event(cursor, user_id, "OTP_VERIFIED", f"OTP verified successfully for {username}", ip)
        connection.commit()

        return {
            "success": True,
            "message": "Verification code verified successfully.",
            "reset_token": reset_token,
        }

    except HTTPException:
        if connection:
            connection.rollback()
        raise
    except Exception as exc:
        if connection:
            connection.rollback()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.post("/api/auth/forgot-password/reset")
def reset_password(data: ResetPasswordRequest, request: Request = None):
    connection = None
    cursor = None
    try:
        if data.new_password != data.confirm_password:
            raise HTTPException(status_code=400, detail="New password and confirmation password do not match.")

        validate_strong_password(data.new_password)

        connection = get_connection()
        cursor = connection.cursor()

        token = data.reset_token.strip()

        cursor.execute(
            """
            SELECT id, user_id, reset_token_expires_at, is_used
            FROM password_reset_otps
            WHERE reset_token = %s AND is_used = FALSE
            LIMIT 1;
            """,
            (token,),
        )
        record = cursor.fetchone()

        if not record:
            raise HTTPException(status_code=400, detail="Invalid or expired password reset session. Please request a new code.")

        otp_id, user_id, token_expires_at, is_used = record

        cursor.execute("SELECT NOW() > %s;", (token_expires_at,))
        expired = cursor.fetchone()[0]
        if expired:
            cursor.execute("UPDATE password_reset_otps SET is_used = TRUE WHERE id = %s;", (otp_id,))
            connection.commit()
            raise HTTPException(status_code=400, detail="Password reset session has expired. Please request a new code.")

        cursor.execute("SELECT id, username, password_hash FROM users WHERE id = %s;", (user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User account not found.")

        user_id, username, current_hash = user

        if verify_password(data.new_password, current_hash):
            raise HTTPException(status_code=400, detail="New password cannot be identical to your current password.")

        new_hash = hash_password(data.new_password)

        cursor.execute("UPDATE users SET password_hash = %s WHERE id = %s;", (new_hash, user_id))
        cursor.execute("UPDATE password_reset_otps SET is_used = TRUE WHERE id = %s;", (otp_id,))

        ip = request.client.host if request and request.client else None
        log_security_event(cursor, user_id, "PASSWORD_RESET_SUCCESS", f"Password successfully reset for {username}", ip)
        connection.commit()

        return {
            "success": True,
            "message": "Password has been successfully reset. Please log in with your new password.",
        }

    except HTTPException:
        if connection:
            connection.rollback()
        raise
    except Exception as exc:
        if connection:
            connection.rollback()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.post("/api/auth/change-password")
def change_password(data: ChangePasswordRequest, request: Request = None):
    connection = None
    cursor = None
    try:
        if data.new_password != data.confirm_password:
            raise HTTPException(status_code=400, detail="New password and confirmation password do not match.")

        if data.current_password == data.new_password:
            raise HTTPException(status_code=400, detail="New password cannot be identical to your current password.")

        validate_strong_password(data.new_password)

        connection = get_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT id, username, password_hash FROM users WHERE id = %s;", (data.user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User account not found.")

        user_id, username, stored_hash = user
        ip = request.client.host if request and request.client else None

        if not verify_password(data.current_password, stored_hash):
            log_security_event(cursor, user_id, "PASSWORD_CHANGE_FAILED", f"Incorrect current password entered for {username}", ip)
            connection.commit()
            raise HTTPException(status_code=400, detail="Current password does not match our records.")

        new_hash = hash_password(data.new_password)
        cursor.execute("UPDATE users SET password_hash = %s WHERE id = %s;", (new_hash, user_id))

        log_security_event(cursor, user_id, "PASSWORD_CHANGED", f"Password changed successfully for {username}", ip)
        connection.commit()

        return {
            "success": True,
            "message": "Password changed successfully.",
        }

    except HTTPException:
        if connection:
            connection.rollback()
        raise
    except Exception as exc:
        if connection:
            connection.rollback()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


# =========================================================
# PROFILE MANAGEMENT
# =========================================================

@app.get("/api/profile/me")
def get_my_profile(
    user_id: int | None = Query(None),
    x_user_id: int | None = Header(None, alias="X-User-Id"),
):
    actual_user_id = user_id or x_user_id
    if not actual_user_id:
        raise HTTPException(status_code=400, detail="User ID is required.")

    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT
                id,
                username,
                role,
                full_name,
                email,
                phone,
                profile_photo_path,
                state,
                email_verified,
                phone_verified,
                preferred_notification_method,
                last_login,
                created_at,
                active
            FROM users
            WHERE id = %s;
            """,
            (actual_user_id,),
        )
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        (
            uid,
            username,
            role,
            full_name,
            email,
            phone,
            photo_path,
            state,
            email_ver,
            phone_ver,
            pref_notif,
            last_login,
            created_at,
            active,
        ) = user

        code_prefix = "CUS" if role == "CUSTOMER" else ("DRV" if role == "DRIVER" else "OPR")
        user_code = f"{code_prefix}-{uid:04d}"

        result = {
            "user_id": uid,
            "user_code": user_code,
            "username": username,
            "role": role,
            "full_name": full_name or "",
            "email": email or "",
            "phone": phone or "",
            "profile_photo_path": photo_path,
            "state": state or "Tamil Nadu",
            "email_verified": bool(email_ver),
            "phone_verified": bool(phone_ver),
            "preferred_notification_method": pref_notif or "IN_APP",
            "last_login": last_login.isoformat() if last_login else None,
            "created_at": created_at.isoformat() if created_at else None,
            "active": bool(active),
            "profile": {},
        }

        if role == "CUSTOMER":
            cursor.execute(
                """
                SELECT address, city, pincode, state
                FROM customer_profiles
                WHERE user_id = %s;
                """,
                (uid,),
            )
            c_prof = cursor.fetchone()
            if c_prof:
                result["profile"] = {
                    "address": c_prof[0] or "",
                    "city": c_prof[1] or "",
                    "pincode": c_prof[2] or "",
                    "state": c_prof[3] or state or "Tamil Nadu",
                }
        elif role == "DRIVER":
            cursor.execute(
                """
                SELECT license_number, vehicle_number, vehicle_type, availability_status
                FROM driver_profiles
                WHERE user_id = %s;
                """,
                (uid,),
            )
            d_prof = cursor.fetchone()
            if d_prof:
                result["profile"] = {
                    "license_number": d_prof[0] or "",
                    "vehicle_number": d_prof[1] or "",
                    "vehicle_type": d_prof[2] or "",
                    "availability_status": d_prof[3] or "AVAILABLE",
                }
        elif role == "OPERATOR":
            result["profile"] = {
                "clearance": "COMMAND_OPERATOR",
                "system_role": "LOGISTICS_OPERATOR",
                "department": "CENTRAL_DISPATCH_TN",
            }

        return {
            "success": True,
            "user": result,
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.put("/api/profile/me")
def update_my_profile(data: UpdateProfileRequest, request: Request = None):
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT id, username, role FROM users WHERE id = %s;", (data.user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        user_id, username, role = user

        user_updates = []
        user_params = []

        if data.full_name is not None:
            user_updates.append("full_name = %s")
            user_params.append(data.full_name.strip())

        if data.email is not None and role in ["CUSTOMER", "OPERATOR"]:
            user_updates.append("email = %s")
            user_params.append(data.email.strip())

        if data.phone is not None:
            user_updates.append("phone = %s")
            user_params.append(data.phone.strip())

        if data.state is not None:
            user_updates.append("state = %s")
            user_params.append(data.state.strip())

        if data.preferred_notification_method is not None:
            method = data.preferred_notification_method.upper().strip()
            if method in ["IN_APP", "EMAIL", "SMS"]:
                user_updates.append("preferred_notification_method = %s")
                user_params.append(method)

        if user_updates:
            user_params.append(user_id)
            cursor.execute(
                f"UPDATE users SET {', '.join(user_updates)} WHERE id = %s;",
                tuple(user_params),
            )

        if role == "CUSTOMER":
            c_updates = []
            c_params = []
            if data.address is not None:
                c_updates.append("address = %s")
                c_params.append(data.address.strip())
            if data.city is not None:
                c_updates.append("city = %s")
                c_params.append(data.city.strip())
            if data.state is not None:
                c_updates.append("state = %s")
                c_params.append(data.state.strip())
            if data.pincode is not None:
                c_updates.append("pincode = %s")
                c_params.append(data.pincode.strip())
            if c_updates:
                c_params.append(user_id)
                cursor.execute(
                    f"UPDATE customer_profiles SET {', '.join(c_updates)} WHERE user_id = %s;",
                    tuple(c_params),
                )

        elif role == "DRIVER":
            if data.availability_status is not None:
                avail = data.availability_status.upper().strip()
                if avail in ["AVAILABLE", "ON_DUTY", "RESTING", "OFF_DUTY"]:
                    cursor.execute(
                        "UPDATE driver_profiles SET availability_status = %s WHERE user_id = %s;",
                        (avail, user_id),
                    )

        ip = request.client.host if request and request.client else None
        log_security_event(cursor, user_id, "PROFILE_UPDATED", f"Profile updated for {username}", ip)
        connection.commit()

        return {
            "success": True,
            "message": "Profile updated successfully.",
        }

    except HTTPException:
        if connection:
            connection.rollback()
        raise
    except Exception as exc:
        if connection:
            connection.rollback()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.post("/api/profile/me/photo")
async def upload_profile_photo(
    user_id: int = Form(...),
    file: UploadFile = File(...),
    request: Request = None,
):
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT id, username, profile_photo_path FROM users WHERE id = %s;", (user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        uid, username, old_photo_path = user

        content = await file.read()
        max_bytes = MAX_PROFILE_IMAGE_MB * 1024 * 1024
        if len(content) > max_bytes:
            raise HTTPException(
                status_code=400,
                detail=f"Image exceeds maximum size of {MAX_PROFILE_IMAGE_MB}MB.",
            )

        ext = validate_image_bytes(content)

        filename = f"user_{uid}_{uuid.uuid4().hex[:12]}.{ext}"
        save_path = UPLOAD_DIR / filename

        with open(save_path, "wb") as f:
            f.write(content)

        rel_path = f"/uploads/profiles/{filename}"
        cursor.execute("UPDATE users SET profile_photo_path = %s WHERE id = %s;", (rel_path, uid))

        if old_photo_path and old_photo_path.startswith("/uploads/profiles/"):
            old_file = BASE_DIR / old_photo_path.lstrip("/")
            if old_file.exists() and old_file.is_file():
                try:
                    old_file.unlink()
                except Exception:
                    pass

        ip = request.client.host if request and request.client else None
        log_security_event(cursor, uid, "PROFILE_PHOTO_UPDATED", f"Profile photo updated for {username}", ip)
        connection.commit()

        return {
            "success": True,
            "message": "Profile photo updated successfully.",
            "profile_photo_path": rel_path,
        }

    except HTTPException:
        if connection:
            connection.rollback()
        raise
    except Exception as exc:
        if connection:
            connection.rollback()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.delete("/api/profile/me/photo")
def delete_profile_photo(user_id: int = Query(...), request: Request = None):
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT id, username, profile_photo_path FROM users WHERE id = %s;", (user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        uid, username, photo_path = user

        if photo_path and photo_path.startswith("/uploads/profiles/"):
            file_on_disk = BASE_DIR / photo_path.lstrip("/")
            if file_on_disk.exists() and file_on_disk.is_file():
                try:
                    file_on_disk.unlink()
                except Exception:
                    pass

        cursor.execute("UPDATE users SET profile_photo_path = NULL WHERE id = %s;", (uid,))
        ip = request.client.host if request and request.client else None
        log_security_event(cursor, uid, "PROFILE_PHOTO_DELETED", f"Profile photo removed for {username}", ip)
        connection.commit()

        return {
            "success": True,
            "message": "Profile photo removed successfully.",
        }

    except HTTPException:
        if connection:
            connection.rollback()
        raise
    except Exception as exc:
        if connection:
            connection.rollback()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.get("/api/profile/security-events")
def get_user_security_events(user_id: int = Query(...), limit: int = Query(20)):
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT id, event_type, description, ip_address, created_at
            FROM security_events
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT %s;
            """,
            (user_id, max(1, min(limit, 100))),
        )
        rows = cursor.fetchall()

        events = []
        for r in rows:
            events.append({
                "id": r[0],
                "event_type": r[1],
                "description": r[2],
                "ip_address": r[3] or "local",
                "created_at": r[4].isoformat() if r[4] else None,
            })

        return {
            "success": True,
            "security_events": events,
        }

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


# =========================================================
# ROUTING & GEOCODING PROXIES
# =========================================================

@app.get("/api/geo/search")
async def geo_search(q: str = Query(...), limit: int = Query(5)):
    try:
        url = f"{NOMINATIM_BASE_URL}/search"
        headers = {"User-Agent": NOMINATIM_USER_AGENT}
        params = {"q": q, "format": "json", "limit": limit, "addressdetails": 1}
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code == 200:
                return resp.json()
            return []
    except Exception:
        return []


@app.get("/api/geo/reverse")
async def geo_reverse(lat: float = Query(...), lon: float = Query(...)):
    try:
        url = f"{NOMINATIM_BASE_URL}/reverse"
        headers = {"User-Agent": NOMINATIM_USER_AGENT}
        params = {"lat": lat, "lon": lon, "format": "json"}
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code == 200:
                return resp.json()
            return {}
    except Exception:
        return {}


@app.get("/api/routing/osrm/route/v1/driving/{coordinates:path}")
async def osrm_proxy(
    coordinates: str,
    overview: str = "full",
    geometries: str = "geojson",
    alternatives: str = "true",
    steps: str = "true",
):
    try:
        target_url = f"{OSRM_BASE_URL}/route/v1/driving/{coordinates}"
        params = {
            "overview": overview,
            "geometries": geometries,
            "alternatives": alternatives,
            "steps": steps,
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(target_url, params=params)
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OSRM routing failed: {str(e)}")


# =========================================================
# CREATE DRIVER
# OPERATOR ONLY
# =========================================================

@app.post("/api/admin/drivers")
def create_driver(
    data: DriverCreateRequest
):

    connection = None
    cursor = None

    try:

        connection = get_connection()
        cursor = connection.cursor()

        # Verify operator
        cursor.execute(
            """
            SELECT
                id,
                role,
                active
            FROM users
            WHERE username = %s;
            """,
            (data.operator_username,),
        )

        operator = cursor.fetchone()

        if not operator:

            raise HTTPException(
                status_code=403,
                detail="Operator account not found",
            )

        operator_id = operator[0]
        operator_role = operator[1]
        operator_active = operator[2]

        if operator_role != "OPERATOR":

            raise HTTPException(
                status_code=403,
                detail="Only operator can create driver accounts",
            )

        if not operator_active:

            raise HTTPException(
                status_code=403,
                detail="Operator account is inactive",
            )

        # Check username
        cursor.execute(
            """
            SELECT id
            FROM users
            WHERE username = %s;
            """,
            (data.username,),
        )

        existing_user = cursor.fetchone()

        if existing_user:

            raise HTTPException(
                status_code=400,
                detail="Username already exists",
            )

        # Strong password for driver too
        validate_strong_password(data.password)

        password_hash = hash_password(
            data.password
        )

        # Create driver user
        cursor.execute(
            """
            INSERT INTO users
            (
                username,
                password_hash,
                role,
                full_name,
                email,
                phone
            )
            VALUES
            (
                %s,
                %s,
                'DRIVER',
                %s,
                %s,
                %s
            )
            RETURNING id;
            """,
            (
                data.username,
                password_hash,
                data.full_name,
                data.email,
                data.phone,
            ),
        )

        driver_user_id = cursor.fetchone()[0]

        # Driver profile
        cursor.execute(
            """
            INSERT INTO driver_profiles
            (
                user_id,
                license_number,
                vehicle_number,
                vehicle_type,
                created_by
            )
            VALUES
            (
                %s,
                %s,
                %s,
                %s,
                %s
            );
            """,
            (
                driver_user_id,
                data.license_number,
                data.vehicle_number,
                data.vehicle_type,
                operator_id,
            ),
        )

        connection.commit()

        driver_id = f"DRV-{driver_user_id:04d}"

        return {
            "success": True,
            "message": "Driver account created successfully",
            "driver_id": driver_id,
            "user_id": driver_user_id,
            "username": data.username,
            "role": "DRIVER",
            "full_name": data.full_name,
            "vehicle_number": data.vehicle_number,
        }

    except HTTPException:

        if connection:
            connection.rollback()

        raise

    except Exception as e:

        if connection:
            connection.rollback()

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )

    finally:

        if cursor:
            cursor.close()

        if connection:
            connection.close()


# =========================================================
# LIST DRIVERS
# =========================================================

@app.get("/api/admin/drivers")
def list_drivers():

    connection = None
    cursor = None

    try:

        connection = get_connection()
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT
                u.id,
                u.username,
                u.full_name,
                u.email,
                u.phone,
                u.active,
                d.license_number,
                d.vehicle_number,
                d.vehicle_type
            FROM users u
            JOIN driver_profiles d
                ON u.id = d.user_id
            WHERE u.role = 'DRIVER'
            ORDER BY u.id DESC;
            """
        )

        drivers = cursor.fetchall()

        result = []

        for driver in drivers:

            result.append(
                {
                    "driver_id": f"DRV-{driver[0]:04d}",
                    "user_id": driver[0],
                    "username": driver[1],
                    "full_name": driver[2],
                    "email": driver[3],
                    "phone": driver[4],
                    "active": driver[5],
                    "license_number": driver[6],
                    "vehicle_number": driver[7],
                    "vehicle_type": driver[8],
                }
            )

        return {
            "success": True,
            "drivers": result,
        }

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )

    finally:

        if cursor:
            cursor.close()

        if connection:
            connection.close()


# =========================================================
# DISRUPTION ANALYSIS
# =========================================================

@app.post("/api/disruptions/analyze")
def analyze_disruption_api(
    data: DisruptionRequest
):
    connection = None
    cursor = None

    try:
        # ---------------------------------
        # 1. ANALYZE DISRUPTION
        # ---------------------------------
        result = analyze_disruption(
            data.disruption_type,
            data.severity,
            data.description,
        )

        connection = get_connection()
        cursor = connection.cursor()

        # ---------------------------------
        # 2. VERIFY SHIPMENT
        # ---------------------------------
        cursor.execute(
            """
            SELECT
                shipment_code,
                origin,
                destination,
                current_location,
                driver_id,
                vehicle_number,
                vehicle_type,
                status
            FROM shipments
            WHERE shipment_code = %s
            """,
            (data.shipment_id,)
        )

        shipment = cursor.fetchone()

        if not shipment:
            raise HTTPException(
                status_code=404,
                detail=f"Shipment {data.shipment_id} not found"
            )

        (
            shipment_code,
            origin,
            destination,
            current_location,
            driver_id,
            vehicle_number,
            vehicle_type,
            shipment_status,
        ) = shipment

        # ---------------------------------
        # 3. CREATE DISRUPTION
        # ---------------------------------
        cursor.execute(
            """
            INSERT INTO disruptions
            (
                shipment_id,
                disruption_type,
                severity,
                location,
                description,
                status
            )
            VALUES
            (
                %s,
                %s,
                %s,
                %s,
                %s,
                'ACTIVE'
            )
            RETURNING id;
            """,
            (
                data.shipment_id,
                data.disruption_type.upper(),
                data.severity.upper(),
                data.location,
                data.description,
            ),
        )

        disruption_id = cursor.fetchone()[0]

        # ---------------------------------
        # 4. GENERATE ROUTE RECOMMENDATION
        # ---------------------------------
        disruption_type = data.disruption_type.upper()

        if disruption_type == "ROAD_BLOCK":
            recommended_route = (
                f"{current_location} → Alternate Corridor → {destination}"
            )
            alternate_route = (
                f"{current_location} → Secondary Road → {destination}"
            )

        elif disruption_type == "VEHICLE_BREAKDOWN":
            recommended_route = (
                f"{current_location} → Replacement Vehicle → {destination}"
            )
            alternate_route = (
                f"{current_location} → Nearby Transfer Hub → {destination}"
            )

        elif disruption_type == "WEATHER":
            recommended_route = (
                f"{current_location} → Safer Corridor → {destination}"
            )
            alternate_route = (
                f"{current_location} → Weather-Safe Route → {destination}"
            )

        elif disruption_type == "PORT_DELAY":
            recommended_route = (
                f"{current_location} → Alternate Port → {destination}"
            )
            alternate_route = (
                f"{current_location} → Alternate Logistics Hub → {destination}"
            )

        elif disruption_type == "FUEL_SHORTAGE":
            recommended_route = (
                f"{current_location} → Alternate Fuel Point → {destination}"
            )
            alternate_route = (
                f"{current_location} → Fuel-Optimized Corridor → {destination}"
            )

        else:
            recommended_route = (
                f"{current_location} → Alternate Corridor → {destination}"
            )
            alternate_route = (
                f"{current_location} → Secondary Corridor → {destination}"
            )

        # ---------------------------------
        # 5. ALTERNATIVE ACTIONS
        # ---------------------------------
        actions_text = str(
            result["alternative_actions"]
        )

        # ---------------------------------
        # 6. CREATE RECOVERY PLAN
        # ---------------------------------
        cursor.execute(
            """
            INSERT INTO recovery_plans
            (
                disruption_id,
                priority,
                impact_summary,
                recommended_action,
                alternative_actions,
                estimated_delay,
                estimated_cost,
                approval_status,
                shipment_code,
                recommended_route,
                alternate_route,
                assigned_driver_id,
                execution_status
            )
            VALUES
            (
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                'PENDING',
                %s,
                %s,
                %s,
                %s,
                'PENDING'
            )
            RETURNING id;
            """,
            (
                disruption_id,
                result["priority"],
                result["impact_summary"],
                result["recommended_action"],
                actions_text,
                result["estimated_delay"],
                result["estimated_cost"],
                shipment_code,
                recommended_route,
                alternate_route,
                driver_id,
            ),
        )

        recovery_plan_id = cursor.fetchone()[0]

        # ---------------------------------
        # 7. UPDATE SHIPMENT STATUS
        # ---------------------------------
        cursor.execute(
            """
            UPDATE shipments
            SET
                status = 'DISRUPTED',
                priority = %s,
                estimated_delay = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE shipment_code = %s
            """,
            (
                result["priority"],
                result["estimated_delay"],
                shipment_code,
            ),
        )

        # ---------------------------------
        # Log Shipment Events
        # ---------------------------------
        log_shipment_event(
            cursor,
            shipment_code,
            "DISRUPTION_REPORTED",
            f"{data.disruption_type.replace('_', ' ')} disruption reported at {data.location or 'active corridor'}. Severity: {data.severity}.",
            "OPERATOR",
        )
        log_shipment_event(
            cursor,
            shipment_code,
            "IMPACT_ANALYZED",
            f"Impact calculated: {result['estimated_delay']} min delay, {result['capacity_impact']}% capacity loss. Priority: {result['priority']}.",
            "DECISION_ENGINE",
        )
        log_shipment_event(
            cursor,
            shipment_code,
            "RECOVERY_PLAN_CREATED",
            f"Recovery Plan #{recovery_plan_id} generated. Recommendation: {result['recommended_action']}.",
            "DECISION_ENGINE",
        )

        connection.commit()

        # ---------------------------------
        # 8. RESPONSE
        # ---------------------------------
        return {
            "success": True,

            "disruption_id": disruption_id,

            "recovery_plan_id": recovery_plan_id,

            "shipment_id": shipment_code,

            "shipment_status": "DISRUPTED",

            "origin": origin,

            "destination": destination,

            "current_location": current_location,

            "driver_id": driver_id,

            "vehicle_number": vehicle_number,

            "vehicle_type": vehicle_type,

            "disruption_type":
                data.disruption_type.upper(),

            "severity":
                data.severity.upper(),

            "location":
                data.location,

            "priority":
                result["priority"],

            "severity_score":
                result["severity_score"],

            "impact_summary":
                result["impact_summary"],

            "estimated_delay":
                result["estimated_delay"],

            "estimated_cost":
                result["estimated_cost"],

            "capacity_impact":
                result["capacity_impact"],

            "alternative_actions":
                result["alternative_actions"],

            "recommended_action":
                result["recommended_action"],

            "recommendation_reason":
                result["recommendation_reason"],

            "recommended_route":
                recommended_route,

            "alternate_route":
                alternate_route,

            "approval_status":
                "PENDING",

            "execution_status":
                "PENDING",
        }

    except HTTPException:
        if connection:
            connection.rollback()
        raise

    except Exception as error:
        if connection:
            connection.rollback()

        raise HTTPException(
            status_code=500,
            detail=str(error)
        )

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()

# =========================================================
# APPROVE RECOVERY PLAN
# =========================================================

@app.post("/api/recovery-plans/{recovery_plan_id}/approve")
def approve_recovery_plan(
    recovery_plan_id: int,
    selected_route: str = "RECOMMENDED",
    user_role: str | None = Query(None),
    auth_user_role: str | None = Query(None),
    x_user_role: str | None = Header(None),
):
    req_role = (auth_user_role or user_role or x_user_role or "").upper()
    if req_role in ("DRIVER", "CUSTOMER"):
        raise HTTPException(
            status_code=403,
            detail="Access forbidden: Drivers and customers cannot approve recovery plans. Operator authority required.",
        )

    connection = get_connection()
    cursor = connection.cursor()

    try:
        # ---------------------------------------------------------
        # 1. Get recovery plan + shipment details
        # ---------------------------------------------------------
        cursor.execute(
            """
            SELECT
                rp.id,
                rp.disruption_id,
                rp.shipment_code,
                rp.recommended_route,
                rp.alternate_route,
                rp.assigned_driver_id,
                rp.approval_status,
                rp.execution_status,
                d.disruption_type,
                d.severity
            FROM recovery_plans rp
            LEFT JOIN disruptions d
                ON d.id = rp.disruption_id
            WHERE rp.id = %s
            """,
            (recovery_plan_id,),
        )

        plan = cursor.fetchone()

        if not plan:
            raise HTTPException(
                status_code=404,
                detail="Recovery plan not found",
            )

        (
            plan_id,
            disruption_id,
            shipment_code,
            recommended_route,
            alternate_route,
            assigned_driver_id,
            approval_status,
            execution_status,
            disruption_type,
            severity,
        ) = plan

        if not shipment_code:
            raise HTTPException(
                status_code=400,
                detail="Recovery plan has no shipment code",
            )

        # ---------------------------------------------------------
        # 2. Prevent duplicate approval
        # ---------------------------------------------------------
        if approval_status == "APPROVED":
            return {
                "success": True,
                "message": "Recovery plan is already approved.",
                "recovery_plan_id": plan_id,
                "shipment_code": shipment_code,
                "approval_status": "APPROVED",
                "execution_status": execution_status,
            }

        # ---------------------------------------------------------
        # 3. Select route
        # ---------------------------------------------------------
        selected_route = selected_route.upper()

        if selected_route == "ALTERNATIVE":
            final_route = alternate_route or recommended_route
        else:
            final_route = recommended_route

        # ---------------------------------------------------------
        # 4. Get shipment
        # ---------------------------------------------------------
        cursor.execute(
            """
            SELECT
                id,
                shipment_code,
                driver_id,
                origin,
                destination,
                current_location,
                status,
                priority,
                vehicle_number,
                vehicle_type
            FROM shipments
            WHERE shipment_code = %s
            """,
            (shipment_code,),
        )

        shipment = cursor.fetchone()

        if not shipment:
            raise HTTPException(
                status_code=404,
                detail=f"Shipment {shipment_code} not found",
            )

        (
            shipment_id,
            shipment_code,
            current_driver_id,
            origin,
            destination,
            current_location,
            shipment_status,
            priority,
            vehicle_number,
            vehicle_type,
        ) = shipment

        # ---------------------------------------------------------
        # 5. Determine driver
        # ---------------------------------------------------------
        final_driver_id = assigned_driver_id or current_driver_id

        # ---------------------------------------------------------
        # 6. Update recovery plan
        # ---------------------------------------------------------
        cursor.execute(
            """
            UPDATE recovery_plans
            SET
                approval_status = 'APPROVED',
                execution_status = 'EXECUTED',
                recommended_route = %s,
                assigned_driver_id = %s,
                risk_level = 'LOW'
            WHERE id = %s
            """,
            (
                final_route,
                final_driver_id,
                recovery_plan_id,
            ),
        )

        # ---------------------------------------------------------
        # 7. Update shipment
        # ---------------------------------------------------------
        cursor.execute(
            """
            UPDATE shipments
            SET
                driver_id = %s,
                status = 'IN_TRANSIT',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (
                final_driver_id,
                shipment_id,
            ),
        )

        # ---------------------------------------------------------
        # 8. Mark disruption as recovered
        # ---------------------------------------------------------
        cursor.execute(
            """
            UPDATE disruptions
            SET
                status = 'RECOVERY_APPLIED'
            WHERE id = %s
            """,
            (disruption_id,),
        )

        # ---------------------------------------------------------
        # 9. Log Shipment Events
        # ---------------------------------------------------------
        log_shipment_event(
            cursor,
            shipment_code,
            "RECOVERY_PLAN_APPROVED",
            f"Operator approved recovery plan #{recovery_plan_id} ({selected_route} route: {final_route}).",
            "OPERATOR",
        )
        log_shipment_event(
            cursor,
            shipment_code,
            "DRIVER_PLAN_RECEIVED",
            f"Approved recovery plan dispatched to driver #{final_driver_id}.",
            "LOGISTICS_SYSTEM",
        )

        create_customer_notification(
            cursor,
            None,
            shipment_code,
            "Recovery Plan Approved",
            f"Logistics operator approved recovery plan. Alternative corridor ({final_route}) activated toward destination {destination}.",
            "RECOVERY_APPROVED",
        )

        # ---------------------------------------------------------
        # 10. Commit everything
        # ---------------------------------------------------------
        connection.commit()

        return {
            "success": True,
            "message": "Recovery plan approved and shipment updated successfully.",
            "recovery_plan_id": recovery_plan_id,
            "shipment_code": shipment_code,
            "selected_route": selected_route,
            "final_route": final_route,
            "origin": origin,
            "destination": destination,
            "current_location": current_location,
            "driver_id": final_driver_id,
            "vehicle_number": vehicle_number,
            "vehicle_type": vehicle_type,
            "disruption_type": disruption_type,
            "severity": severity,
            "approval_status": "APPROVED",
            "execution_status": "EXECUTED",
            "shipment_status": "IN_TRANSIT",
            "disruption_status": "RECOVERY_APPLIED",
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as error:
        connection.rollback()

        raise HTTPException(
            status_code=500,
            detail=f"Failed to approve recovery plan: {str(error)}",
        )

    finally:
        cursor.close()
        connection.close()

# =========================================================
# DASHBOARD METRICS
# =========================================================

@app.get("/api/dashboard/metrics")
def dashboard_metrics():

    connection = None
    cursor = None

    try:

        connection = get_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT COUNT(*) FROM disruptions;")
        total_disruptions = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM disruptions WHERE severity = 'CRITICAL';")
        critical_disruptions = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM recovery_plans WHERE approval_status = 'PENDING';")
        pending_plans = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM recovery_plans WHERE approval_status = 'APPROVED';")
        approved_plans = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM disruptions WHERE status = 'ACTIVE';")
        active_disruptions = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM shipments;")
        total_shipments = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM shipments WHERE status IN ('IN_TRANSIT', 'DISRUPTED');")
        active_shipments = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM shipments WHERE status = 'DISRUPTED';")
        disrupted_shipments = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM shipments WHERE priority = 'CRITICAL';")
        critical_shipments = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM shipments WHERE status = 'DELIVERED';")
        completed_deliveries = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'DRIVER' AND active = TRUE;")
        active_drivers = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM incident_history;")
        total_incidents = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM driver_responses WHERE status = 'PENDING';")
        pending_driver_responses = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM customer_requests WHERE status = 'PENDING';")
        pending_customer_requests = cursor.fetchone()[0]

        return {
            "success": True,
            "total_shipments": total_shipments,
            "active_shipments": active_shipments,
            "disrupted_shipments": disrupted_shipments,
            "critical_shipments": critical_shipments,
            "pending_recovery_plans": pending_plans,
            "approved_recovery_plans": approved_plans,
            "total_disruptions": total_disruptions,
            "critical_disruptions": critical_disruptions,
            "active_disruptions": active_disruptions,
            "active_drivers": active_drivers,
            "completed_deliveries": completed_deliveries,
            "total_incidents": total_incidents,
            "pending_driver_responses": pending_driver_responses,
            "pending_customer_requests": pending_customer_requests,
        }

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )

    finally:

        if cursor:
            cursor.close()

        if connection:
            connection.close()

@app.get("/api/users")
def get_all_users():
    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        SELECT
            id,
            username,
            full_name,
            role,
            email,
            phone,
            active
        FROM users
        ORDER BY id DESC
    """)

    rows = cursor.fetchall()

    cursor.close()
    connection.close()

    return [
        {
            "id": row[0],
            "username": row[1],
            "full_name": row[2],
            "role": row[3],
            "email": row[4],
            "phone": row[5],
            "active": row[6],
        }
        for row in rows
    ]

@app.get("/api/customers")
def get_customers():
    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        SELECT
            id,
            username,
            full_name,
            email,
            phone,
            active
        FROM users
        WHERE role = 'CUSTOMER'
        ORDER BY id DESC
    """)

    rows = cursor.fetchall()

    cursor.close()
    connection.close()

    return [
        {
            "id": row[0],
            "username": row[1],
            "full_name": row[2],
            "email": row[3],
            "phone": row[4],
            "active": row[5],
        }
        for row in rows
    ]

@app.get("/api/drivers")
def get_drivers():
    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        SELECT
            u.id,
            u.username,
            u.full_name,
            u.email,
            u.phone,
            u.active,
            d.license_number,
            d.vehicle_number,
            d.vehicle_type
        FROM users u
        LEFT JOIN driver_profiles d
            ON u.id = d.user_id
        WHERE u.role = 'DRIVER'
        ORDER BY u.id DESC
    """)

    rows = cursor.fetchall()

    cursor.close()
    connection.close()

    return [
        {
            "id": row[0],
            "username": row[1],
            "full_name": row[2],
            "email": row[3],
            "phone": row[4],
            "active": row[5],
            "license_number": row[6],
            "vehicle_number": row[7],
            "vehicle_type": row[8],
        }
        for row in rows
    ]

class DriverCreate(BaseModel):
    username: str
    password: str
    full_name: str
    email: str = ""
    phone: str = ""
    license_number: str
    vehicle_number: str
    vehicle_type: str = "Delivery Truck"
    operator_username: str

@app.post("/api/drivers")
def create_driver(driver: DriverCreate):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "SELECT id FROM users WHERE username = %s",
            (driver.username,)
        )

        if cursor.fetchone():
            raise HTTPException(
                status_code=400,
                detail="Username already exists"
            )

        validate_strong_password(driver.password)

        cursor.execute(
            """
            SELECT id FROM users
            WHERE username = %s AND role = 'OPERATOR'
            """,
            (driver.operator_username,)
        )

        operator = cursor.fetchone()

        if not operator:
            raise HTTPException(
                status_code=403,
                detail="Only a valid operator can create drivers"
            )

        password_hash = hash_password(driver.password)

        cursor.execute(
            """
            INSERT INTO users
            (
                username,
                password_hash,
                role,
                full_name,
                email,
                phone
            )
            VALUES (%s, %s, 'DRIVER', %s, %s, %s)
            RETURNING id
            """,
            (
                driver.username,
                password_hash,
                driver.full_name,
                driver.email,
                driver.phone,
            )
        )

        user_id = cursor.fetchone()[0]

        cursor.execute(
            """
            INSERT INTO driver_profiles
            (
                user_id,
                license_number,
                vehicle_number,
                vehicle_type,
                created_by
            )
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                user_id,
                driver.license_number,
                driver.vehicle_number,
                driver.vehicle_type,
                operator[0],
            )
        )

        connection.commit()

        return {
            "message": "Driver created successfully",
            "driver_id": user_id,
            "username": driver.username,
            "role": "DRIVER",
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as error:
        connection.rollback()
        raise HTTPException(
            status_code=500,
            detail=str(error)
        )

    finally:
        cursor.close()
        connection.close()

class ShipmentCreate(BaseModel):
    shipment_code: str
    customer_id: int | None = None
    driver_id: int | None = None
    origin: str
    destination: str
    current_location: str = ""
    status: str = "PENDING"
    priority: str = "MEDIUM"
    vehicle_number: str = ""
    vehicle_type: str = ""


@app.post("/api/shipments")
def create_shipment(shipment: ShipmentCreate):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "SELECT id FROM shipments WHERE shipment_code = %s",
            (shipment.shipment_code,)
        )

        if cursor.fetchone():
            raise HTTPException(
                status_code=400,
                detail="Shipment ID already exists"
            )

        if shipment.driver_id is not None:
            cursor.execute(
                """
                SELECT id
                FROM users
                WHERE id = %s AND role = 'DRIVER'
                """,
                (shipment.driver_id,)
            )

            if not cursor.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="Invalid driver ID"
                )

        cursor.execute(
            """
            INSERT INTO shipments
            (
                shipment_code,
                customer_id,
                driver_id,
                origin,
                destination,
                current_location,
                status,
                priority,
                vehicle_number,
                vehicle_type
            )
            VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                shipment.shipment_code,
                shipment.customer_id,
                shipment.driver_id,
                shipment.origin,
                shipment.destination,
                shipment.current_location,
                shipment.status,
                shipment.priority,
                shipment.vehicle_number,
                shipment.vehicle_type,
            )
        )

        shipment_id = cursor.fetchone()[0]

        connection.commit()

        return {
            "message": "Shipment created successfully",
            "shipment_id": shipment_id,
            "shipment_code": shipment.shipment_code,
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as error:
        connection.rollback()
        raise HTTPException(
            status_code=500,
            detail=str(error)
        )

    finally:
        cursor.close()
        connection.close()


@app.get("/api/shipments")
def get_shipments():
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT
                s.id,
                s.shipment_code,
                s.customer_id,
                s.driver_id,
                s.origin,
                s.destination,
                s.current_location,
                s.status,
                s.priority,
                s.vehicle_number,
                s.vehicle_type,
                s.estimated_eta,
                s.created_at,
                s.updated_at,
                u.full_name AS driver_name
            FROM shipments s
            LEFT JOIN users u
                ON s.driver_id = u.id
            ORDER BY s.created_at DESC
            """
        )

        rows = cursor.fetchall()

        shipments = []

        for row in rows:
            shipments.append({
                "id": row[0],
                "shipment_code": row[1],
                "customer_id": row[2],
                "driver_id": row[3],
                "origin": row[4],
                "destination": row[5],
                "current_location": row[6],
                "status": row[7],
                "priority": row[8],
                "vehicle_number": row[9],
                "vehicle_type": row[10],
                "estimated_eta": row[11],
                "created_at": row[12],
                "updated_at": row[13],
                "driver_name": row[14],
            })

        return shipments

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error)
        )

    finally:
        cursor.close()
        connection.close()


@app.get("/api/shipments/{shipment_id}")
def get_shipment(shipment_id: int):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT
                s.id,
                s.shipment_code,
                s.customer_id,
                s.driver_id,
                s.origin,
                s.destination,
                s.current_location,
                s.status,
                s.priority,
                s.vehicle_number,
                s.vehicle_type,
                s.estimated_eta,
                s.created_at,
                s.updated_at,
                u.full_name AS driver_name
            FROM shipments s
            LEFT JOIN users u
                ON s.driver_id = u.id
            WHERE s.id = %s
            """,
            (shipment_id,)
        )

        row = cursor.fetchone()

        if not row:
            raise HTTPException(
                status_code=404,
                detail="Shipment not found"
            )

        return {
            "id": row[0],
            "shipment_code": row[1],
            "customer_id": row[2],
            "driver_id": row[3],
            "origin": row[4],
            "destination": row[5],
            "current_location": row[6],
            "status": row[7],
            "priority": row[8],
            "vehicle_number": row[9],
            "vehicle_type": row[10],
            "estimated_eta": row[11],
            "created_at": row[12],
            "updated_at": row[13],
            "driver_name": row[14],
        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error)
        )

    finally:
        cursor.close()
        connection.close()

@app.get("/api/driver/{driver_id}/active-shipment")
def get_driver_active_shipment(driver_id: int):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT
                s.id,
                s.shipment_code,
                s.origin,
                s.destination,
                s.current_location,
                s.status,
                s.priority,
                s.vehicle_number,
                s.vehicle_type,
                s.updated_at,
                s.estimated_delay,
                s.category,
                s.deadline,
                s.priority_category
            FROM shipments s
            WHERE s.driver_id = %s
            ORDER BY CASE WHEN s.status IN ('IN_TRANSIT', 'DISRUPTED') THEN 0 ELSE 1 END, s.updated_at DESC
            LIMIT 1
            """,
            (driver_id,),
        )

        shipment = cursor.fetchone()

        if not shipment:
            cursor.execute(
                """
                SELECT
                    s.id,
                    s.shipment_code,
                    s.origin,
                    s.destination,
                    s.current_location,
                    s.status,
                    s.priority,
                    s.vehicle_number,
                    s.vehicle_type,
                    s.updated_at,
                    s.estimated_delay,
                    s.category,
                    s.deadline,
                    s.priority_category
                FROM shipments s
                WHERE s.shipment_code = 'SHP-LOGI-001'
                ORDER BY s.updated_at DESC
                LIMIT 1
                """
            )
            shipment = cursor.fetchone()
            if shipment:
                cursor.execute(
                    "UPDATE shipments SET driver_id = %s WHERE id = %s;",
                    (driver_id, shipment[0]),
                )
                connection.commit()

        if not shipment:
            return {
                "success": True,
                "has_shipment": False,
                "message": "No active shipment assigned.",
            }

        (
            shipment_id,
            shipment_code,
            origin,
            destination,
            current_location,
            status,
            priority,
            vehicle_number,
            vehicle_type,
            updated_at,
            estimated_delay,
            category,
            deadline,
            priority_category,
        ) = shipment

        cursor.execute(
            """
            SELECT
                rp.id,
                rp.priority,
                rp.impact_summary,
                rp.recommended_action,
                rp.recommended_route,
                rp.alternate_route,
                rp.estimated_delay,
                rp.estimated_cost,
                rp.approval_status,
                rp.execution_status,
                rp.risk_level,
                d.disruption_type,
                d.severity,
                d.location,
                d.description,
                d.status
            FROM recovery_plans rp
            JOIN disruptions d
                ON d.id = rp.disruption_id
            WHERE rp.shipment_code = %s
            ORDER BY rp.created_at DESC
            LIMIT 1
            """,
            (shipment_code,),
        )

        recovery = cursor.fetchone()
        recovery_data = None

        if recovery:
            (
                recovery_id,
                recovery_priority,
                impact_summary,
                recommended_action,
                recommended_route,
                alternate_route,
                plan_delay,
                estimated_cost,
                approval_status,
                execution_status,
                risk_level,
                disruption_type,
                severity,
                disruption_location,
                description,
                disruption_status,
            ) = recovery

            recovery_data = {
                "recovery_plan_id": recovery_id,
                "priority": recovery_priority,
                "impact_summary": impact_summary,
                "recommended_action": recommended_action,
                "recommended_route": recommended_route,
                "alternate_route": alternate_route,
                "estimated_delay": plan_delay,
                "estimated_cost": float(estimated_cost or 0),
                "approval_status": approval_status,
                "execution_status": execution_status,
                "risk_level": risk_level or "LOW",
                "disruption_type": disruption_type,
                "severity": severity,
                "location": disruption_location,
                "description": description,
                "disruption_status": disruption_status,
            }

        cursor.execute(
            """
            SELECT
                id, response_type, issue_type, severity, description,
                suggested_route, reason, estimated_improvement, status,
                operator_notes, created_at, validation_status, observed_road_condition,
                driver_notes, estimated_delay_minutes, validation_details
            FROM driver_responses
            WHERE shipment_code = %s
            ORDER BY created_at DESC
            LIMIT 10;
            """,
            (shipment_code,),
        )
        responses = []
        for dr in cursor.fetchall():
            v_det = dr[15]
            if isinstance(v_det, str):
                try:
                    v_det = json.loads(v_det)
                except Exception:
                    v_det = {}
            elif not isinstance(v_det, dict):
                v_det = {}

            responses.append({
                "id": dr[0],
                "response_type": dr[1],
                "issue_type": dr[2],
                "severity": dr[3],
                "description": dr[4],
                "suggested_route": dr[5],
                "reason": dr[6],
                "estimated_improvement": dr[7],
                "status": dr[8],
                "operator_notes": dr[9],
                "created_at": dr[10],
                "validation_status": dr[11] or "PENDING",
                "observed_road_condition": dr[12] or "",
                "driver_notes": dr[13] or "",
                "estimated_delay_minutes": dr[14] or 0,
                "validation_details": v_det,
            })

        cursor.execute(
            """
            SELECT id, event_type, description, created_by, created_at
            FROM shipment_events
            WHERE shipment_code = %s
            ORDER BY created_at ASC;
            """,
            (shipment_code,),
        )
        events = [
            {
                "id": ev[0],
                "event_type": ev[1],
                "description": ev[2],
                "created_by": ev[3],
                "created_at": ev[4],
            }
            for ev in cursor.fetchall()
        ]

        cursor.execute(
            """
            SELECT id, message, status, created_at
            FROM customer_requests
            WHERE shipment_code = %s
            ORDER BY created_at DESC LIMIT 1;
            """,
            (shipment_code,),
        )
        cust_req = cursor.fetchone()
        customer_request_data = None
        if cust_req:
            customer_request_data = {
                "id": cust_req[0],
                "message": cust_req[1],
                "status": cust_req[2],
                "created_at": cust_req[3],
            }

        return {
            "success": True,
            "has_shipment": True,
            "shipment": {
                "id": shipment_id,
                "shipment_code": shipment_code,
                "origin": origin,
                "destination": destination,
                "current_location": current_location,
                "status": status,
                "priority": priority,
                "vehicle_number": vehicle_number,
                "vehicle_type": vehicle_type,
                "updated_at": updated_at,
                "estimated_delay": estimated_delay or 0,
                "category": category or "STANDARD_CARGO",
                "deadline": deadline,
                "priority_category": priority_category or "P3",
            },
            "recovery": recovery_data,
            "driver_responses": responses,
            "events": events,
            "customer_request": customer_request_data,
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load driver shipment: {str(error)}",
        )

    finally:
        cursor.close()
        connection.close()


# =========================================================
# RECOVERY PLANS MANAGEMENT & RE-EVALUATION
# =========================================================

@app.get("/api/recovery-plans")
def list_recovery_plans():
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT
                rp.id,
                rp.disruption_id,
                rp.shipment_code,
                rp.priority,
                rp.impact_summary,
                rp.recommended_action,
                rp.alternative_actions,
                rp.estimated_delay,
                rp.estimated_cost,
                rp.approval_status,
                rp.execution_status,
                rp.recommended_route,
                rp.alternate_route,
                rp.assigned_driver_id,
                rp.risk_level,
                rp.created_at,
                d.disruption_type,
                d.severity,
                d.location,
                d.description,
                d.status AS disruption_status,
                u.full_name AS driver_name
            FROM recovery_plans rp
            LEFT JOIN disruptions d ON d.id = rp.disruption_id
            LEFT JOIN users u ON u.id = rp.assigned_driver_id
            ORDER BY rp.created_at DESC;
            """
        )

        rows = cursor.fetchall()
        plans = []

        for r in rows:
            plans.append({
                "id": r[0],
                "disruption_id": r[1],
                "shipment_code": r[2],
                "priority": r[3],
                "impact_summary": r[4],
                "recommended_action": r[5],
                "alternative_actions": r[6],
                "estimated_delay": r[7],
                "estimated_cost": float(r[8] or 0),
                "approval_status": r[9],
                "execution_status": r[10],
                "recommended_route": r[11],
                "alternate_route": r[12],
                "assigned_driver_id": r[13],
                "risk_level": r[14] or "LOW",
                "created_at": r[15],
                "disruption_type": r[16],
                "severity": r[17],
                "location": r[18],
                "description": r[19],
                "disruption_status": r[20],
                "driver_name": r[21],
            })

        return plans

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))

    finally:
        cursor.close()
        connection.close()


@app.post("/api/recovery-plans/{recovery_plan_id}/reevaluate")
def reevaluate_recovery_plan(recovery_plan_id: int):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT
                rp.id,
                rp.shipment_code,
                rp.disruption_id,
                d.disruption_type,
                d.severity,
                d.location,
                d.description,
                s.origin,
                s.destination,
                s.current_location,
                s.driver_id,
                s.vehicle_number,
                s.vehicle_type
            FROM recovery_plans rp
            JOIN disruptions d ON d.id = rp.disruption_id
            JOIN shipments s ON s.shipment_code = rp.shipment_code
            WHERE rp.id = %s;
            """,
            (recovery_plan_id,),
        )

        plan_row = cursor.fetchone()
        if not plan_row:
            raise HTTPException(status_code=404, detail="Recovery plan not found")

        (
            p_id,
            shipment_code,
            disruption_id,
            disruption_type,
            severity,
            location,
            description,
            origin,
            destination,
            current_location,
            driver_id,
            vehicle_number,
            vehicle_type,
        ) = plan_row

        cursor.execute(
            "SELECT message FROM customer_requests WHERE shipment_code = %s ORDER BY created_at DESC LIMIT 1;",
            (shipment_code,),
        )
        urg_row = cursor.fetchone()
        urg_msg = urg_row[0] if urg_row else "High operational risk detected"

        result = recalculate_with_urgency(disruption_type, severity, "HIGH", urg_msg)

        recommended_route = f"{current_location} → Priority Emergency Corridor → {destination}"
        alternate_route = f"{current_location} → Secondary Express Bypass → {destination}"

        cursor.execute(
            """
            INSERT INTO recovery_plans
            (
                disruption_id,
                priority,
                impact_summary,
                recommended_action,
                alternative_actions,
                estimated_delay,
                estimated_cost,
                approval_status,
                shipment_code,
                recommended_route,
                alternate_route,
                assigned_driver_id,
                execution_status,
                risk_level
            )
            VALUES
            (
                %s, %s, %s, %s, %s, %s, %s, 'PENDING', %s, %s, %s, %s, 'PENDING', 'RE_EVALUATED'
            )
            RETURNING id;
            """,
            (
                disruption_id,
                result["priority"],
                result["impact_summary"],
                result["recommended_action"],
                str(result["alternative_actions"]),
                result["estimated_delay"],
                result["estimated_cost"],
                shipment_code,
                recommended_route,
                alternate_route,
                driver_id,
            ),
        )

        new_plan_id = cursor.fetchone()[0]

        cursor.execute(
            """
            UPDATE shipments
            SET priority = %s,
                estimated_delay = %s,
                status = 'DISRUPTED',
                updated_at = CURRENT_TIMESTAMP
            WHERE shipment_code = %s;
            """,
            (result["priority"], result["estimated_delay"], shipment_code),
        )

        log_shipment_event(
            cursor,
            shipment_code,
            "RISK_ESCALATED",
            f"Operational risk escalated. Decision engine triggered for re-evaluation (Plan #{new_plan_id}).",
            "DECISION_ENGINE",
        )
        log_shipment_event(
            cursor,
            shipment_code,
            "RECOVERY_PLAN_REEVALUATED",
            f"Recovery plan re-evaluated. New recommended action: {result['recommended_action']} (Priority: {result['priority']}).",
            "DECISION_ENGINE",
        )

        connection.commit()

        return {
            "success": True,
            "message": "Recovery plan re-evaluated successfully",
            "original_plan_id": recovery_plan_id,
            "recovery_plan_id": new_plan_id,
            "shipment_code": shipment_code,
            "priority": result["priority"],
            "impact_summary": result["impact_summary"],
            "recommended_action": result["recommended_action"],
            "recommendation_reason": result["recommendation_reason"],
            "recommended_route": recommended_route,
            "alternate_route": alternate_route,
            "estimated_delay": result["estimated_delay"],
            "estimated_cost": result["estimated_cost"],
            "alternative_actions": result["alternative_actions"],
            "risk_level": "RE_EVALUATED",
            "approval_status": "PENDING",
            "execution_status": "PENDING",
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as exc:
        connection.rollback()
        raise HTTPException(status_code=500, detail=str(exc))

    finally:
        cursor.close()
        connection.close()


# =========================================================
# DRIVER RESPONSES & OPERATOR DECISION
# =========================================================

@app.post("/api/driver-responses")
def submit_driver_response(data: DriverResponseCreate):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        # Fetch shipment context for validation
        cursor.execute(
            """
            SELECT origin, destination, current_location, customer_id
            FROM shipments WHERE shipment_code = %s;
            """,
            (data.shipment_code,),
        )
        shp_row = cursor.fetchone()
        origin = shp_row[0] if shp_row else "Coimbatore"
        destination = shp_row[1] if shp_row else "Chennai"
        current_loc = shp_row[2] if shp_row else "Salem Corridor"
        customer_id = shp_row[3] if shp_row else None

        cursor.execute(
            """
            SELECT location FROM disruptions WHERE shipment_id = %s ORDER BY created_at DESC LIMIT 1;
            """,
            (data.shipment_code,),
        )
        disr_row = cursor.fetchone()
        disr_loc = disr_row[0] if disr_row else "Salem Highway (NH44)"

        cursor.execute(
            """
            SELECT recommended_route FROM recovery_plans WHERE id = %s;
            """,
            (data.recovery_plan_id,),
        )
        rp_row = cursor.fetchone()
        curr_route = rp_row[0] if rp_row else f"{origin} -> {destination}"

        validation = {}
        validation_status = "PENDING"

        if data.response_type == "ROUTE_SUGGESTED":
            validation = validate_driver_route(
                suggested_route=data.suggested_route or "",
                original_origin=origin,
                original_destination=destination,
                current_location=current_loc,
                disruption_location=disr_loc,
                current_route=curr_route,
                estimated_delay_minutes=data.estimated_delay_minutes or 0,
            )
            validation_status = validation.get("validation_status", "PARTIAL")

        cursor.execute(
            """
            INSERT INTO driver_responses
            (
                shipment_code,
                recovery_plan_id,
                driver_id,
                response_type,
                issue_type,
                severity,
                description,
                suggested_route,
                reason,
                estimated_improvement,
                observed_road_condition,
                estimated_delay_minutes,
                driver_notes,
                validation_status,
                validation_details,
                proposed_waypoints,
                status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'PENDING')
            RETURNING id, created_at;
            """,
            (
                data.shipment_code,
                data.recovery_plan_id,
                data.driver_id,
                data.response_type,
                data.issue_type,
                data.severity,
                data.description,
                data.suggested_route,
                data.reason,
                data.estimated_improvement,
                data.observed_road_condition or "",
                data.estimated_delay_minutes or 0,
                data.driver_notes or "",
                validation_status,
                json.dumps(validation),
                data.proposed_waypoints or "",
            ),
        )

        row = cursor.fetchone()
        response_id = row[0]
        created_at = row[1]

        if data.response_type == "ACCEPTED":
            log_shipment_event(
                cursor,
                data.shipment_code,
                "DRIVER_ACCEPTED",
                f"Driver ID #{data.driver_id} accepted the recovery plan.",
                "DRIVER",
            )
        elif data.response_type == "ISSUE_REPORTED":
            log_shipment_event(
                cursor,
                data.shipment_code,
                "DRIVER_REPORTED_ISSUE",
                f"Driver reported ground issue: {data.issue_type or 'Ground Disruption'} - {data.description or 'No details'}. Severity: {data.severity or 'MEDIUM'}. Condition: {data.observed_road_condition or 'N/A'}.",
                "DRIVER",
            )
            if data.severity and data.severity.upper() in ("HIGH", "CRITICAL"):
                if data.recovery_plan_id:
                    cursor.execute(
                        "UPDATE recovery_plans SET risk_level = 'HIGH' WHERE id = %s;",
                        (data.recovery_plan_id,),
                    )
                else:
                    cursor.execute(
                        """
                        UPDATE recovery_plans
                        SET risk_level = 'HIGH'
                        WHERE id = (
                            SELECT id FROM recovery_plans WHERE shipment_code = %s ORDER BY created_at DESC LIMIT 1
                        );
                        """,
                        (data.shipment_code,),
                    )

                log_shipment_event(
                    cursor,
                    data.shipment_code,
                    "RISK_ESCALATED",
                    f"Operational risk escalated to HIGH due to ground issue reported by driver: {data.issue_type or 'Disruption'}.",
                    "SYSTEM",
                )
        elif data.response_type == "ROUTE_SUGGESTED":
            valid_summary = validation.get("validation_summary", "Validation complete")
            log_shipment_event(
                cursor,
                data.shipment_code,
                "DRIVER_SUGGESTED_ROUTE",
                f"Driver proposed route: {data.suggested_route}. Reason: {data.reason or 'Route optimization'}. Condition: {data.observed_road_condition or 'N/A'}. Validation: {validation_status} ({valid_summary}).",
                "DRIVER",
            )

            # In-app notification to customer
            create_customer_notification(
                cursor,
                customer_id,
                data.shipment_code,
                "Driver Proposed Alternative Route",
                f"Your driver suggested a practical route bypass ({data.suggested_route}) due to observed ground condition: '{data.observed_road_condition or 'Heavy traffic'}'. Logistics is reviewing.",
                "ROUTE_PROPOSED",
            )

        connection.commit()

        return {
            "success": True,
            "id": response_id,
            "message": f"Driver response ({data.response_type}) recorded successfully",
            "validation": validation,
            "validation_status": validation_status,
            "created_at": created_at,
        }

    except Exception as exc:
        connection.rollback()
        raise HTTPException(status_code=500, detail=str(exc))

    finally:
        cursor.close()
        connection.close()


@app.get("/api/driver-responses")
def get_driver_responses(shipment_code: str | None = None):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        query = """
            SELECT
                dr.id,
                dr.shipment_code,
                dr.recovery_plan_id,
                dr.driver_id,
                dr.response_type,
                dr.issue_type,
                dr.severity,
                dr.description,
                dr.suggested_route,
                dr.reason,
                dr.estimated_improvement,
                dr.status,
                dr.operator_notes,
                dr.created_at,
                dr.updated_at,
                u.full_name AS driver_name,
                u.username AS driver_username,
                dr.observed_road_condition,
                dr.estimated_delay_minutes,
                dr.driver_notes,
                dr.validation_status,
                dr.validation_details,
                dr.proposed_waypoints
            FROM driver_responses dr
            LEFT JOIN users u ON u.id = dr.driver_id
        """
        params = []
        if shipment_code:
            query += " WHERE dr.shipment_code = %s"
            params.append(shipment_code)

        query += " ORDER BY dr.created_at DESC;"

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        responses = []
        for r in rows:
            v_details = r[21]
            if isinstance(v_details, str):
                try:
                    v_details = json.loads(v_details)
                except Exception:
                    v_details = {}
            elif not isinstance(v_details, dict):
                v_details = {}

            responses.append({
                "id": r[0],
                "shipment_code": r[1],
                "recovery_plan_id": r[2],
                "driver_id": r[3],
                "response_type": r[4],
                "issue_type": r[5],
                "severity": r[6],
                "description": r[7],
                "suggested_route": r[8],
                "reason": r[9],
                "estimated_improvement": r[10],
                "status": r[11],
                "operator_notes": r[12],
                "created_at": r[13],
                "updated_at": r[14],
                "driver_name": r[15],
                "driver_username": r[16],
                "observed_road_condition": r[17],
                "estimated_delay_minutes": r[18],
                "driver_notes": r[19],
                "validation_status": r[20],
                "validation_details": v_details,
                "proposed_waypoints": r[22],
            })

        return responses

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    finally:
        cursor.close()
        connection.close()


@app.post("/api/driver-responses/{response_id}/decide")
def decide_driver_response(response_id: int, data: DriverResponseDecision):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT id, shipment_code, recovery_plan_id, driver_id, response_type, suggested_route, issue_type, description
            FROM driver_responses
            WHERE id = %s;
            """,
            (response_id,),
        )
        resp = cursor.fetchone()
        if not resp:
            raise HTTPException(status_code=404, detail="Driver response not found")

        (r_id, shipment_code, recovery_plan_id, driver_id, response_type, suggested_route, issue_type, description) = resp

        decision_status = "ACCEPTED" if data.decision.upper() == "ACCEPT" else "REJECTED"

        cursor.execute(
            """
            UPDATE driver_responses
            SET status = %s,
                operator_notes = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s;
            """,
            (decision_status, data.operator_notes, response_id),
        )

        if decision_status == "ACCEPTED":
            if response_type == "ROUTE_SUGGESTED" and suggested_route:
                if recovery_plan_id:
                    cursor.execute(
                        "UPDATE recovery_plans SET recommended_route = %s WHERE id = %s;",
                        (suggested_route, recovery_plan_id),
                    )
                else:
                    cursor.execute(
                        """
                        UPDATE recovery_plans
                        SET recommended_route = %s
                        WHERE id = (
                            SELECT id FROM recovery_plans WHERE shipment_code = %s ORDER BY created_at DESC LIMIT 1
                        );
                        """,
                        (suggested_route, shipment_code),
                    )

                cursor.execute(
                    "UPDATE shipments SET updated_at = CURRENT_TIMESTAMP WHERE shipment_code = %s;",
                    (shipment_code,),
                )

                log_shipment_event(
                    cursor,
                    shipment_code,
                    "LOGISTICS_UPDATED_PLAN",
                    f"Logistics approved driver suggested route: {suggested_route}. Plan updated.",
                    "OPERATOR",
                )

                create_customer_notification(
                    cursor,
                    None,
                    shipment_code,
                    "Route Bypass Approved",
                    f"Logistics approved practical alternative route ({suggested_route}). Destination preserved and transit continuing.",
                    "ROUTE_DECIDED",
                )
            else:
                log_shipment_event(
                    cursor,
                    shipment_code,
                    "LOGISTICS_UPDATED_PLAN",
                    f"Logistics acknowledged ground issue: {issue_type}. Operator notes: {data.operator_notes or 'Validated'}.",
                    "OPERATOR",
                )
        else:
            log_shipment_event(
                cursor,
                shipment_code,
                "LOGISTICS_REJECTED_SUGGESTION",
                f"Logistics reviewed driver response: Rejected. {data.operator_notes or 'Standard recovery plan maintained.'}",
                "OPERATOR",
            )

            create_customer_notification(
                cursor,
                None,
                shipment_code,
                "Primary Route Maintained",
                f"Logistics reviewed ground route suggestion and retained primary recovery corridor. {data.operator_notes or ''}".strip(),
                "ROUTE_DECIDED",
            )

        connection.commit()

        return {
            "success": True,
            "message": f"Driver response marked {decision_status}",
            "response_id": response_id,
            "status": decision_status,
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as exc:
        connection.rollback()
        raise HTTPException(status_code=500, detail=str(exc))

    finally:
        cursor.close()
        connection.close()


# =========================================================
# CUSTOMER URGENCY & CUSTOMER PORTAL
# =========================================================

@app.post("/api/customer-urgency")
def submit_customer_urgency(data: CustomerUrgencyRequest):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        urg_lvl = (data.urgency_level or "HIGH").upper()

        cursor.execute(
            """
            INSERT INTO customer_requests (shipment_code, customer_id, request_type, urgency_level, message, status)
            VALUES (%s, %s, 'URGENT_DELIVERY', %s, %s, 'PENDING')
            RETURNING id, created_at;
            """,
            (data.shipment_code, data.customer_id, urg_lvl, data.message),
        )
        req_id, created_at = cursor.fetchone()

        # Check existing category to avoid downgrading medical emergencies
        cursor.execute(
            "SELECT category FROM shipments WHERE shipment_code = %s;",
            (data.shipment_code,),
        )
        cat_row = cursor.fetchone()
        existing_cat = (cat_row[0] or "STANDARD_CARGO").upper() if cat_row else "STANDARD_CARGO"

        new_priority = "CRITICAL"
        new_category_tier = "P0" if existing_cat == "EMERGENCY_MEDICAL" else "P2"

        cursor.execute(
            """
            UPDATE shipments
            SET priority = %s,
                priority_category = %s,
                priority_explanation = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE shipment_code = %s;
            """,
            (
                new_priority,
                new_category_tier,
                f"Customer explicit urgency request ('{data.message}'). Priority category set to {new_category_tier}.",
                data.shipment_code,
            ),
        )

        cursor.execute(
            """
            UPDATE recovery_plans
            SET priority = 'CRITICAL'
            WHERE id = (
                SELECT id FROM recovery_plans WHERE shipment_code = %s ORDER BY created_at DESC LIMIT 1
            );
            """,
            (data.shipment_code,),
        )

        log_shipment_event(
            cursor,
            data.shipment_code,
            "CUSTOMER_URGENCY_REQUEST",
            f"Customer submitted urgency request: '{data.message}' (Level: {urg_lvl}). Priority escalated to CRITICAL.",
            "CUSTOMER",
        )
        log_shipment_event(
            cursor,
            data.shipment_code,
            "PRIORITY_RECALCULATED",
            f"Priority escalated to {new_category_tier} ({new_priority}) by Decision Engine based on customer urgency request.",
            "DECISION_ENGINE",
        )

        # In-app notification to customer
        create_customer_notification(
            cursor,
            data.customer_id,
            data.shipment_code,
            "Urgency Request Registered",
            f"Your urgency request ('{data.message}') has been registered. Dispatch priority escalated to {new_priority}.",
            "URGENCY_ACKNOWLEDGED",
        )

        connection.commit()

        return {
            "success": True,
            "request_id": req_id,
            "message": f"Urgency request registered. Shipment priority upgraded to {new_priority}.",
            "shipment_code": data.shipment_code,
            "priority": new_priority,
            "priority_category": new_category_tier,
        }

    except Exception as exc:
        connection.rollback()
        raise HTTPException(status_code=500, detail=str(exc))

    finally:
        cursor.close()
        connection.close()


@app.get("/api/customer-requests")
def get_customer_requests():
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT
                cr.id,
                cr.shipment_code,
                cr.customer_id,
                cr.request_type,
                cr.message,
                cr.status,
                cr.created_at,
                u.full_name AS customer_name,
                u.username AS customer_username,
                cr.urgency_level,
                cr.operator_decision,
                cr.operator_notes
            FROM customer_requests cr
            LEFT JOIN users u ON u.id = cr.customer_id
            ORDER BY cr.created_at DESC;
            """
        )
        rows = cursor.fetchall()
        return [
            {
                "id": r[0],
                "shipment_code": r[1],
                "customer_id": r[2],
                "request_type": r[3],
                "message": r[4],
                "status": r[5],
                "created_at": r[6],
                "customer_name": r[7],
                "customer_username": r[8],
                "urgency_level": r[9] or "HIGH",
                "operator_decision": r[10] or "PENDING",
                "operator_notes": r[11] or "",
            }
            for r in rows
        ]

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    finally:
        cursor.close()
        connection.close()


@app.get("/api/customer/{customer_id}/shipments")
def get_customer_shipments(
    customer_id: int,
    auth_user_id: int | None = Query(None),
    auth_user_role: str | None = Query(None),
    x_user_id: str | None = Header(None),
    x_user_role: str | None = Header(None),
):
    caller_id = auth_user_id or (int(x_user_id) if x_user_id and x_user_id.isdigit() else None)
    caller_role = (auth_user_role or x_user_role or "").upper()

    # Enforce permission: customer cannot access another customer's shipments
    if caller_role == "CUSTOMER" and caller_id and caller_id != customer_id:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden: Customers are not permitted to view other customers' private shipments.",
        )

    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT
                s.id,
                s.shipment_code,
                s.origin,
                s.destination,
                s.current_location,
                s.status,
                s.priority,
                s.vehicle_number,
                s.vehicle_type,
                s.estimated_eta,
                s.estimated_delay,
                s.updated_eta,
                s.created_at,
                s.updated_at,
                s.category,
                s.deadline,
                s.priority_category
            FROM shipments s
            WHERE s.customer_id = %s
            ORDER BY s.updated_at DESC;
            """,
            (customer_id,),
        )
        rows = cursor.fetchall()

        # If no shipment specifically linked to customer_id yet (e.g. demo setup), link unassigned demo shipment
        if not rows:
            cursor.execute(
                """
                SELECT
                    s.id,
                    s.shipment_code,
                    s.origin,
                    s.destination,
                    s.current_location,
                    s.status,
                    s.priority,
                    s.vehicle_number,
                    s.vehicle_type,
                    s.estimated_eta,
                    s.estimated_delay,
                    s.updated_eta,
                    s.created_at,
                    s.updated_at,
                    s.category,
                    s.deadline,
                    s.priority_category
                FROM shipments s
                WHERE s.customer_id IS NULL AND s.shipment_code = 'SHP-LOGI-001'
                ORDER BY s.updated_at DESC;
                """
            )
            rows = cursor.fetchall()
            if rows:
                cursor.execute(
                    "UPDATE shipments SET customer_id = %s WHERE id = %s;",
                    (customer_id, rows[0][0]),
                )
                connection.commit()

        result = []

        for r in rows:
            shp_code = r[1]
            status = r[5]
            delay = r[10] or 0

            cursor.execute(
                """
                SELECT disruption_type, severity, location, status
                FROM disruptions
                WHERE shipment_id = %s
                ORDER BY created_at DESC LIMIT 1;
                """,
                (shp_code,),
            )
            disr = cursor.fetchone()

            if status == "DELIVERED":
                customer_message = "Your shipment has been successfully delivered."
            elif status == "DISRUPTED":
                customer_message = (
                    "Your shipment has experienced an operational disruption. "
                    "Our logistics team is working on an alternative recovery plan. "
                    f"Updated turnaround: ~{delay} minutes delay."
                )
            elif delay > 0:
                customer_message = f"Shipment recovered and in transit. Turnaround delay: ~{delay} mins."
            else:
                customer_message = "Your shipment is moving on schedule and in transit."

            cursor.execute(
                """
                SELECT id, event_type, description, created_at
                FROM shipment_events
                WHERE shipment_code = %s
                ORDER BY created_at ASC;
                """,
                (shp_code,),
            )
            events = [
                {"id": er[0], "event_type": er[1], "description": er[2], "created_at": er[3]}
                for er in cursor.fetchall()
            ]

            result.append({
                "id": r[0],
                "shipment_code": shp_code,
                "origin": r[2],
                "destination": r[3],
                "current_location": r[4],
                "status": status,
                "priority": r[6],
                "vehicle_number": r[7],
                "vehicle_type": r[8],
                "estimated_eta": r[9],
                "estimated_delay": delay,
                "updated_eta": r[11],
                "created_at": r[12],
                "updated_at": r[13],
                "category": r[14] or "STANDARD_CARGO",
                "deadline": r[15],
                "priority_category": r[16] or "P3",
                "customer_message": customer_message,
                "disruption_active": (status == "DISRUPTED"),
                "events": events,
            })

        return result

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    finally:
        cursor.close()
        connection.close()


# =========================================================
# DELIVERY COMPLETION & INCIDENT HISTORY
# =========================================================

@app.post("/api/shipments/{shipment_code}/complete")
def complete_shipment(shipment_code: str, data: CompleteDeliveryRequest):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT id, origin, destination, current_location, driver_id, vehicle_number
            FROM shipments
            WHERE shipment_code = %s;
            """,
            (shipment_code,),
        )
        shp = cursor.fetchone()
        if not shp:
            raise HTTPException(status_code=404, detail="Shipment not found")

        shp_id, origin, destination, current_location, driver_id, vehicle_number = shp

        cursor.execute(
            """
            UPDATE shipments
            SET status = 'DELIVERED',
                current_location = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE shipment_code = %s;
            """,
            (destination, shipment_code),
        )

        cursor.execute(
            """
            SELECT
                d.id,
                d.disruption_type,
                d.severity,
                rp.id,
                rp.recommended_route,
                rp.approval_status,
                rp.estimated_delay,
                rp.estimated_cost
            FROM disruptions d
            LEFT JOIN recovery_plans rp ON rp.disruption_id = d.id
            WHERE d.shipment_id = %s
            ORDER BY d.created_at DESC
            LIMIT 1;
            """,
            (shipment_code,),
        )
        disr_row = cursor.fetchone()

        disruption_id = disr_row[0] if disr_row else None
        disruption_type = disr_row[1] if disr_row else "None"
        severity = disr_row[2] if disr_row else "LOW"
        recovery_plan_id = disr_row[3] if disr_row else None
        recovery_route = disr_row[4] if disr_row else f"{origin} → {destination}"
        operator_decision = disr_row[5] if disr_row else "APPROVED"
        total_delay = disr_row[6] if disr_row else 0
        recovery_cost = disr_row[7] if disr_row else 0

        cursor.execute(
            """
            SELECT response_type FROM driver_responses
            WHERE shipment_code = %s ORDER BY created_at DESC LIMIT 1;
            """,
            (shipment_code,),
        )
        dr_row = cursor.fetchone()
        driver_resp_val = dr_row[0] if dr_row else "ACCEPTED"

        cursor.execute(
            """
            SELECT message FROM customer_requests
            WHERE shipment_code = %s ORDER BY created_at DESC LIMIT 1;
            """,
            (shipment_code,),
        )
        cr_row = cursor.fetchone()
        cust_req_val = cr_row[0] if cr_row else "Standard Delivery"

        cursor.execute(
            """
            INSERT INTO incident_history
            (
                shipment_code,
                disruption_id,
                recovery_plan_id,
                disruption_type,
                severity,
                original_route,
                recovery_route,
                operator_decision,
                driver_response,
                customer_request,
                final_status,
                final_eta,
                total_delay,
                recovery_cost,
                incident_outcome
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'DELIVERED', CURRENT_TIMESTAMP, %s, %s, %s)
            RETURNING id;
            """,
            (
                shipment_code,
                disruption_id,
                recovery_plan_id,
                disruption_type,
                severity,
                f"{origin} → {destination}",
                recovery_route,
                operator_decision,
                driver_resp_val,
                cust_req_val,
                total_delay,
                recovery_cost,
                f"Successfully recovered and delivered to destination {destination}. {data.notes or ''}".strip(),
            ),
        )
        incident_id = cursor.fetchone()[0]

        log_shipment_event(
            cursor,
            shipment_code,
            "DELIVERY_COMPLETED",
            f"Delivery successfully completed at destination {destination}. Incident #{incident_id} recorded in history.",
            "DRIVER",
        )

        create_customer_notification(
            cursor,
            None,
            shipment_code,
            "Delivery Completed",
            f"Your shipment {shipment_code} has safely arrived at destination {destination}. {data.notes or ''}".strip(),
            "DELIVERED",
        )

        connection.commit()

        return {
            "success": True,
            "message": "Delivery completed successfully and archived in incident history.",
            "incident_id": incident_id,
            "shipment_code": shipment_code,
            "final_status": "DELIVERED",
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as exc:
        connection.rollback()
        raise HTTPException(status_code=500, detail=str(exc))

    finally:
        cursor.close()
        connection.close()


@app.get("/api/incidents")
def get_incident_history():
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT
                id,
                shipment_code,
                disruption_id,
                recovery_plan_id,
                disruption_type,
                severity,
                original_route,
                recovery_route,
                operator_decision,
                driver_response,
                customer_request,
                final_status,
                final_eta,
                total_delay,
                recovery_cost,
                incident_outcome,
                completed_at
            FROM incident_history
            ORDER BY completed_at DESC;
            """
        )
        rows = cursor.fetchall()
        incidents = []

        for r in rows:
            incidents.append({
                "id": r[0],
                "shipment_code": r[1],
                "disruption_id": r[2],
                "recovery_plan_id": r[3],
                "disruption_type": r[4],
                "severity": r[5],
                "original_route": r[6],
                "recovery_route": r[7],
                "operator_decision": r[8],
                "driver_response": r[9],
                "customer_request": r[10],
                "final_status": r[11],
                "final_eta": r[12],
                "total_delay": r[13],
                "recovery_cost": float(r[14] or 0),
                "incident_outcome": r[15],
                "completed_at": r[16],
            })

        return incidents

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    finally:
        cursor.close()
        connection.close()


# =========================================================
# SHIPMENT EVENTS / AUDIT TIMELINE
# =========================================================

@app.get("/api/shipments/{shipment_code}/events")
def get_shipment_events(shipment_code: str):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT id, shipment_code, event_type, description, created_by, created_at
            FROM shipment_events
            WHERE shipment_code = %s
            ORDER BY created_at ASC;
            """,
            (shipment_code,),
        )
        rows = cursor.fetchall()
        return [
            {
                "id": r[0],
                "shipment_code": r[1],
                "event_type": r[2],
                "description": r[3],
                "created_by": r[4],
                "created_at": r[5],
            }
            for r in rows
        ]

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    finally:
        cursor.close()
        connection.close()


@app.get("/api/shipments/{shipment_code}/history")
def get_shipment_history(shipment_code: str):
    return get_shipment_events(shipment_code)


# =========================================================
# CUSTOMER IN-APP NOTIFICATIONS
# =========================================================

@app.get("/api/customer/{customer_id}/notifications")
def get_customer_notifications(
    customer_id: int,
    auth_user_id: int | None = Query(None),
    auth_user_role: str | None = Query(None),
    x_user_id: str | None = Header(None),
    x_user_role: str | None = Header(None),
):
    caller_id = auth_user_id or (int(x_user_id) if x_user_id and x_user_id.isdigit() else None)
    caller_role = (auth_user_role or x_user_role or "").upper()

    if caller_role == "CUSTOMER" and caller_id and caller_id != customer_id:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden: Customers can only access their own notifications.",
        )

    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT id, shipment_code, title, message, notification_type, updated_eta, action_required, is_read, created_at
            FROM customer_notifications
            WHERE customer_id = %s
            ORDER BY created_at DESC;
            """,
            (customer_id,),
        )
        rows = cursor.fetchall()
        notifications = []
        unread_count = 0

        for r in rows:
            is_read = bool(r[7])
            if not is_read:
                unread_count += 1

            notifications.append({
                "id": r[0],
                "shipment_code": r[1],
                "title": r[2],
                "message": r[3],
                "notification_type": r[4],
                "updated_eta": r[5],
                "action_required": bool(r[6]),
                "is_read": is_read,
                "created_at": r[8],
            })

        return {
            "success": True,
            "customer_id": customer_id,
            "unread_count": unread_count,
            "notifications": notifications,
        }

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    finally:
        cursor.close()
        connection.close()


@app.post("/api/customer/notifications/{notification_id}/mark-read")
def mark_notification_read(notification_id: int):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            UPDATE customer_notifications
            SET is_read = TRUE
            WHERE id = %s
            RETURNING id;
            """,
            (notification_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Notification not found")

        connection.commit()
        return {"success": True, "notification_id": notification_id, "is_read": True}

    except HTTPException:
        connection.rollback()
        raise

    except Exception as exc:
        connection.rollback()
        raise HTTPException(status_code=500, detail=str(exc))

    finally:
        cursor.close()
        connection.close()


@app.post("/api/customer/{customer_id}/notifications/mark-all-read")
@app.post("/api/customer/notifications/mark-all-read")
def mark_all_notifications_read(customer_id: int | None = None):
    if customer_id is None:
        raise HTTPException(status_code=400, detail="customer_id required")
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            UPDATE customer_notifications
            SET is_read = TRUE
            WHERE customer_id = %s;
            """,
            (customer_id,),
        )
        connection.commit()
        return {"success": True, "customer_id": customer_id, "message": "All notifications marked as read"}

    except Exception as exc:
        connection.rollback()
        raise HTTPException(status_code=500, detail=str(exc))

    finally:
        cursor.close()
        connection.close()


# =========================================================
# MULTI-SHIPMENT FAIR PRIORITY QUEUE
# =========================================================

@app.get("/api/priority-queue")
def get_priority_queue(
    category_filter: str | None = Query("ALL"),
    include_delivered: bool = Query(False),
):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        status_clause = "" if include_delivered else "WHERE s.status IN ('IN_TRANSIT', 'DISRUPTED', 'PENDING')"

        cursor.execute(
            f"""
            SELECT
                s.id,
                s.shipment_code,
                s.customer_id,
                s.driver_id,
                s.origin,
                s.destination,
                s.current_location,
                s.status,
                s.priority,
                s.category,
                s.deadline,
                s.priority_category,
                s.priority_score,
                s.priority_explanation,
                s.overtaken_note,
                s.vehicle_number,
                s.vehicle_type,
                s.estimated_eta,
                s.estimated_delay,
                s.updated_eta,
                s.created_at,
                s.updated_at,
                s.remaining_distance_km,
                s.remaining_duration_mins,
                u_cust.full_name AS customer_name,
                u_drv.full_name AS driver_name,
                d.disruption_type,
                d.severity AS disruption_severity,
                d.status AS disruption_status,
                rp.recommended_action,
                rp.approval_status AS plan_approval_status,
                cr.urgency_level AS customer_urgency,
                cr.message AS customer_urgency_message
            FROM shipments s
            LEFT JOIN users u_cust ON u_cust.id = s.customer_id
            LEFT JOIN users u_drv ON u_drv.id = s.driver_id
            LEFT JOIN (
                SELECT DISTINCT ON (shipment_id) id, shipment_id, disruption_type, severity, status
                FROM disruptions
                ORDER BY shipment_id, created_at DESC
            ) d ON d.shipment_id = s.shipment_code AND d.status = 'ACTIVE'
            LEFT JOIN (
                SELECT DISTINCT ON (shipment_code) id, shipment_code, recommended_action, approval_status
                FROM recovery_plans
                ORDER BY shipment_code, created_at DESC
            ) rp ON rp.shipment_code = s.shipment_code
            LEFT JOIN (
                SELECT DISTINCT ON (shipment_code) shipment_code, urgency_level, message
                FROM customer_requests
                WHERE status = 'PENDING'
                ORDER BY shipment_code, created_at DESC
            ) cr ON cr.shipment_code = s.shipment_code
            {status_clause}
            ORDER BY s.created_at ASC;
            """
        )

        rows = cursor.fetchall()
        shipments_raw = []

        for r in rows:
            shipments_raw.append({
                "id": r[0],
                "shipment_code": r[1],
                "customer_id": r[2],
                "driver_id": r[3],
                "origin": r[4],
                "destination": r[5],
                "current_location": r[6],
                "status": r[7],
                "priority": r[8],
                "category": r[9] or "STANDARD_CARGO",
                "deadline": r[10],
                "priority_category": r[11] or "P3",
                "priority_score": float(r[12] or 50.0),
                "priority_explanation": r[13] or "",
                "overtaken_note": r[14] or "",
                "vehicle_number": r[15],
                "vehicle_type": r[16],
                "estimated_eta": r[17],
                "estimated_delay": r[18] or 0,
                "updated_eta": r[19],
                "created_at": r[20],
                "updated_at": r[21],
                "remaining_distance_km": float(r[22] or 510.0),
                "remaining_duration_mins": r[23] or 480,
                "customer_name": r[24] or "Corporate Client",
                "driver_name": r[25] or "Fleet Driver",
                "disruption_type": r[26],
                "disruption_severity": r[27],
                "disruption_status": r[28],
                "recommended_action": r[29] or "Maintain Standard Corridor",
                "plan_approval_status": r[30] or "N/A",
                "customer_urgency": r[31],
                "customer_urgency_message": r[32],
            })

        # Run Fair Multi-Shipment Priority Engine
        ranked_queue = rank_priority_queue(shipments_raw)

        # Sync evaluated rankings back to PostgreSQL
        for item in ranked_queue:
            prev_tier = item.get("priority_category")
            cursor.execute(
                """
                UPDATE shipments
                SET priority_category = %s,
                    priority_score = %s,
                    priority_explanation = %s,
                    overtaken_note = %s
                WHERE shipment_code = %s;
                """,
                (
                    item["priority_category"],
                    item["priority_score"],
                    item["priority_explanation"],
                    item.get("overtaken_note", ""),
                    item["shipment_code"],
                ),
            )

        connection.commit()

        # Calculate counts
        counts = {
            "total": len(ranked_queue),
            "p0": sum(1 for q in ranked_queue if q["priority_category"] == "P0"),
            "p1": sum(1 for q in ranked_queue if q["priority_category"] == "P1"),
            "p2": sum(1 for q in ranked_queue if q["priority_category"] == "P2"),
            "p3": sum(1 for q in ranked_queue if q["priority_category"] == "P3"),
            "p4": sum(1 for q in ranked_queue if q["priority_category"] == "P4"),
            "medical": sum(1 for q in ranked_queue if "MEDICAL" in (q.get("category") or "")),
            "disrupted": sum(1 for q in ranked_queue if q.get("status") == "DISRUPTED"),
        }

        # Apply optional filter
        filtered_queue = ranked_queue
        filter_upper = (category_filter or "ALL").upper()

        if filter_upper == "MEDICAL":
            filtered_queue = [q for q in ranked_queue if "MEDIC" in (q.get("category") or "")]
        elif filter_upper == "EMERGENCY":
            filtered_queue = [q for q in ranked_queue if q.get("priority_category") in ("P0", "P1")]
        elif filter_upper == "CRITICAL_DISRUPTION":
            filtered_queue = [q for q in ranked_queue if q.get("status") == "DISRUPTED" or q.get("disruption_severity") == "CRITICAL"]
        elif filter_upper == "AT_RISK":
            filtered_queue = [q for q in ranked_queue if q.get("deadline_feasibility") in ("AT_RISK", "BREACHED")]
        elif filter_upper == "CUSTOMER_URGENCY":
            filtered_queue = [q for q in ranked_queue if q.get("customer_urgency")]
        elif filter_upper == "NORMAL":
            filtered_queue = [q for q in ranked_queue if q.get("priority_category") in ("P3", "P4")]
        elif filter_upper == "PENDING_APPROVAL":
            filtered_queue = [q for q in ranked_queue if q.get("plan_approval_status") == "PENDING"]

        return {
            "success": True,
            "counts": counts,
            "filter": filter_upper,
            "total_ranked": len(filtered_queue),
            "queue": filtered_queue,
        }

    except Exception as exc:
        connection.rollback()
        raise HTTPException(status_code=500, detail=str(exc))

    finally:
        cursor.close()
        connection.close()


@app.post("/api/priority-queue/recalculate")
def recalculate_priority_queue():
    return get_priority_queue(category_filter="ALL", include_delivered=False)


# =========================================================
# SHIPMENT CLASSIFICATION & DEADLINE MANAGEMENT
# =========================================================

@app.patch("/api/shipments/{shipment_code}/classification")
@app.post("/api/shipments/{shipment_code}/classification")
def update_shipment_classification(
    shipment_code: str,
    data: ShipmentClassificationUpdate,
):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        valid_categories = [
            "GENERAL",
            "MEDICINE",
            "URGENT_MEDICAL",
            "EMERGENCY_MEDICAL",
            "PERISHABLE",
            "TIME_CRITICAL",
            "STANDARD_CARGO",
        ]

        cat_upper = data.category.upper()
        if cat_upper not in valid_categories:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid category '{data.category}'. Allowed: {', '.join(valid_categories)}",
            )

        cursor.execute(
            """
            SELECT id, customer_id, origin, destination, deadline, status, created_at
            FROM shipments WHERE shipment_code = %s;
            """,
            (shipment_code,),
        )
        shp = cursor.fetchone()
        if not shp:
            raise HTTPException(status_code=404, detail="Shipment not found")

        (shp_id, customer_id, origin, destination, curr_deadline, status, created_at) = shp

        new_deadline = data.deadline if data.deadline else curr_deadline

        # Evaluate fair priority under new classification
        eval_result = evaluate_fair_priority({
            "category": cat_upper,
            "status": status,
            "deadline": new_deadline,
            "created_at": created_at,
            "estimated_delay": 0,
        })

        new_tier = eval_result["priority_category"]
        new_score = eval_result["priority_score"]
        explanation = eval_result["priority_explanation"]

        cursor.execute(
            """
            UPDATE shipments
            SET category = %s,
                deadline = COALESCE(%s, deadline),
                priority_category = %s,
                priority_score = %s,
                priority_explanation = %s,
                priority = CASE WHEN %s = 'P0' THEN 'CRITICAL' WHEN %s = 'P1' THEN 'HIGH' ELSE priority END,
                updated_at = CURRENT_TIMESTAMP
            WHERE shipment_code = %s;
            """,
            (
                cat_upper,
                new_deadline,
                new_tier,
                new_score,
                explanation,
                new_tier,
                new_tier,
                shipment_code,
            ),
        )

        # Log history
        cursor.execute(
            """
            INSERT INTO priority_history
            (shipment_code, priority_category, priority_score, previous_category, reasons, triggered_by)
            VALUES (%s, %s, %s, %s, %s, %s);
            """,
            (shipment_code, new_tier, new_score, cat_upper, explanation, data.operator_username or "OPERATOR"),
        )

        log_shipment_event(
            cursor,
            shipment_code,
            "SHIPMENT_CLASSIFICATION_UPDATED",
            f"Classification updated to {cat_upper}. Priority category escalated to {new_tier} ({new_score} pts).",
            data.operator_username or "OPERATOR",
        )

        # In-app notification to customer
        create_customer_notification(
            cursor,
            customer_id,
            shipment_code,
            "Priority Classification Updated",
            f"Your shipment {shipment_code} has been classified as {cat_upper.replace('_', ' ')}. Priority tier: {new_tier}.",
            "CLASSIFICATION_UPDATED",
        )

        connection.commit()

        return {
            "success": True,
            "shipment_code": shipment_code,
            "category": cat_upper,
            "deadline": str(new_deadline) if new_deadline else None,
            "priority_category": new_tier,
            "priority_score": new_score,
            "priority_explanation": explanation,
            "deadline_feasibility": eval_result["deadline_feasibility"],
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as exc:
        connection.rollback()
        raise HTTPException(status_code=500, detail=str(exc))

    finally:
        cursor.close()
        connection.close()