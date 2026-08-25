import os
from dotenv import load_dotenv

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
load_dotenv(os.path.join(BASE_DIR, '.env'))


class Config:
    BASE_DIR = BASE_DIR
    INSTANCE_DIR = os.path.join(BASE_DIR, 'instance')
    # On Render (or any host with a persistent disk) set DATA_DIR=/data so the
    # SQLite database and uploaded videos survive redeploys.
    DATA_DIR = os.environ.get('DATA_DIR', INSTANCE_DIR)
    os.makedirs(DATA_DIR, exist_ok=True)
    SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(DATA_DIR, 'course.db').replace('\\', '/')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-change-in-production')
    UPLOAD_FOLDER = os.path.join(DATA_DIR, 'uploads')
    MAX_CONTENT_LENGTH = 300 * 1024 * 1024

    GOOGLE_OAUTH_CLIENT_ID = os.environ.get('GOOGLE_OAUTH_CLIENT_ID', '')

    ADMIN_EMAIL = 'admin@course.com'
    ADMIN_PASSWORD = 'aayushaaryan1996'