from functools import wraps
from flask import abort
from flask_login import current_user


def admin_required(view_func):
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            abort(403)
        return view_func(*args, **kwargs)
    return wrapped


ALLOWED_VIDEO_EXTENSIONS = {'mp4', 'webm', 'ogg', 'mov', 'mkv'}
ALLOWED_RESOURCE_EXTENSIONS = {'pdf', 'doc', 'docx', 'ppt', 'pptx', 'zip', 'png', 'jpg', 'jpeg', 'gif', 'txt', 'ino', 'h', 'cpp'}


def allowed_video(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_VIDEO_EXTENSIONS


def allowed_file(filename, extensions=None):
    if extensions is None:
        extensions = ALLOWED_RESOURCE_EXTENSIONS
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in extensions