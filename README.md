# Course Platform

A Flask-based learning platform with course paths, video lessons, quizzes, and an Arduino code editor + simulator.

## Local Development

```bash
cd course_platform
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Edit .env with your SECRET_KEY and GOOGLE_OAUTH_CLIENT_ID
python run.py
```

Visit `http://localhost:5000`

Default admin: `admin@course.com` / `admin123`

## PythonAnywhere Deployment

### 1. Upload Project
- Zip the `course_platform` folder and upload to PythonAnywhere (Files tab)
- Or clone via git if you push to a repo

### 2. Create Virtualenv
```bash
# In PythonAnywhere Bash console
cd ~/course_platform
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Configure Environment Variables
Create `.env` in project root:
```
SECRET_KEY=your-super-secret-random-string-here
GOOGLE_OAUTH_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### 4. Web App Setup (Web tab)
- **Source code**: `/home/yourusername/course_platform`
- **Working directory**: `/home/yourusername/course_platform`
- **WSGI configuration file**: Edit to match below

### 5. WSGI File (`/var/www/yourusername_pythonanywhere_com_wsgi.py`)
```python
import sys
import os

project_home = '/home/yourusername/course_platform'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

os.environ['SECRET_KEY'] = 'your-super-secret-random-string-here'
os.environ['GOOGLE_OAUTH_CLIENT_ID'] = 'your-google-client-id.apps.googleusercontent.com'

from dotenv import load_dotenv
load_dotenv(os.path.join(project_home, '.env'))

from wsgi import application
```

### 6. Static Files (Web tab → Static files)
| URL | Directory |
|-----|-----------|
| /static | /home/yourusername/course_platform/app/static |

### 7. Important Notes
- **Video uploads**: PythonAnywhere has a ~100MB request body limit. The app allows 300MB max. Large videos may fail. Consider using external hosting (YouTube/Vimeo) or compress videos.
- **Database**: SQLite file at `instance/course.db` persists across reloads.
- **Upload folder**: `app/static/uploads/videos/` must be writable by the web worker.
- **Google OAuth**: Add your PythonAnywhere domain to Authorized JavaScript Origins in Google Cloud Console.

### 8. Reload & Test
Click "Reload" on the Web tab, then visit your site.

## Features
- Course catalog with "planet trail" visual path
- Topics with multiple lessons (video upload, text, MCQ quiz)
- Enrollment & progress tracking
- GitHub-style activity streak on profile
- Admin panel (courses, topics, lessons, questions, users, hardware)
- Arduino code editor with simulator

## Project Structure
```
course_platform/
├── run.py              # Dev server
├── wsgi.py             # Production WSGI entry
├── requirements.txt
├── .env.example
├── README.md
├── instance/course.db  # SQLite (created on first run)
└── app/
    ├── __init__.py
    ├── config.py
    ├── extensions.py
    ├── utils.py
    ├── models.py
    ├── auth.py
    ├── routes.py
    ├── admin_routes.py
    ├── api_routes.py
    ├── templates/
    │   ├── base.html
    │   ├── main.html
    │   ├── course_view.html
    │   ├── topic_view.html
    │   ├── quiz_result.html
    │   ├── question_new.html
    │   ├── login.html
    │   ├── register.html
    │   ├── profile.html
    │   ├── users.html
    │   ├── error.html
    │   ├── editor.html
    │   └── admin/
    └── static/
        ├── css/style.css
        ├── css/editor.css
        ├── js/main.js
        ├── js/auth.js
        ├── js/admin/courses.js
        └── simulator.js
```