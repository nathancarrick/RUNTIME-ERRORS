import os
from pathlib import Path
import psycopg2
from dotenv import load_dotenv

# Locate and load .env file from backend directory
BASE_DIR = Path(__file__).resolve().parent
env_path = BASE_DIR / ".env"

if env_path.exists():
    load_dotenv(dotenv_path=env_path, override=True)
else:
    # Fallback to current working directory or environment
    load_dotenv(override=True)

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "logiaid")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD")

if not DB_PASSWORD:
    raise RuntimeError(
        "CRITICAL CONFIGURATION ERROR: Missing required 'DB_PASSWORD' in environment. "
        "Please configure backend/.env using backend/.env.example as a template."
    )

if not DB_NAME:
    raise RuntimeError(
        "CRITICAL CONFIGURATION ERROR: Missing required 'DB_NAME' in environment. "
        "Please configure backend/.env."
    )

DB_CONFIG = {
    "host": DB_HOST,
    "port": DB_PORT,
    "database": DB_NAME,
    "user": DB_USER,
    "password": DB_PASSWORD,
}


def get_connection():
    return psycopg2.connect(**DB_CONFIG)