import os
from flask import Blueprint, render_template, request, jsonify, abort, current_app
from flask_login import login_required, current_user
from werkzeug.security import generate_password_hash

from app.extensions import db
from app.models import User, Course, Topic, Lesson, Quiz, Question, Submission, HardwareProfile
from app.utils import allowed_video

admin_bp = Blueprint('admin', __name__)


@admin_bp.before_request
@login_required
def before_request():
    if not current_user.is_admin:
        abort(403)


def _save_video(file):
    import uuid
    from werkzeug.utils import secure_filename
    stored_name = f"{uuid.uuid4().hex}_{secure_filename(file.filename)}"
    upload_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'videos')
    os.makedirs(upload_dir, exist_ok=True)
    file.save(os.path.join(upload_dir, stored_name))
    return stored_name


def _remove_video(filename):
    if not filename:
        return
    path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'videos', filename)
    if os.path.exists(path):
        os.remove(path)


# ---------------------------------------------------------------------------
# Dashboard & pages
# ---------------------------------------------------------------------------

@admin_bp.route('/')
def dashboard():
    users_count = User.query.count()
    courses_count = Course.query.count()
    topics_count = Topic.query.count()
    lessons_count = Lesson.query.count()
    quizzes_count = Quiz.query.count()
    submissions_count = Submission.query.count()
    recent_users = User.query.order_by(User.created_at.desc()).limit(5).all()
    return render_template('admin/dashboard.html',
                           users_count=users_count,
                           courses_count=courses_count,
                           topics_count=topics_count,
                           lessons_count=lessons_count,
                           quizzes_count=quizzes_count,
                           submissions_count=submissions_count,
                           recent_users=recent_users)


@admin_bp.route('/courses')
def courses():
    all_courses = Course.query.order_by(Course.created_at.desc()).all()
    return render_template('admin/courses.html', courses=all_courses)


# ---------------------------------------------------------------------------
# Courses (AJAX)
# ---------------------------------------------------------------------------

@admin_bp.route('/courses/create', methods=['POST'])
def create_course():
    title = request.form.get('title', '').strip()
    description = request.form.get('description', '').strip()
    if not title:
        return jsonify({'success': False, 'message': 'Title required'}), 400
    course = Course(title=title, description=description)
    db.session.add(course)
    db.session.commit()
    return jsonify({'success': True, 'course': {'id': course.id, 'title': course.title}})


@admin_bp.route('/courses/<int:course_id>/update', methods=['POST'])
def update_course(course_id):
    course = Course.query.get_or_404(course_id)
    data = request.get_json(silent=True) or request.form
    course.title = data.get('title', course.title)
    course.description = data.get('description', course.description)
    db.session.commit()
    return jsonify({'success': True})


@admin_bp.route('/courses/<int:course_id>/delete', methods=['POST'])
def delete_course(course_id):
    course = Course.query.get_or_404(course_id)
    for topic in course.topics:
        _remove_video(topic.video_filename)
        for lesson in topic.lessons:
            _remove_video(lesson.video_filename)
    db.session.delete(course)
    db.session.commit()
    return jsonify({'success': True})


# ---------------------------------------------------------------------------
# Topics / Stops (AJAX)
# ---------------------------------------------------------------------------

@admin_bp.route('/courses/<int:course_id>/topics/add', methods=['POST'])
def add_topic(course_id):
    course = Course.query.get_or_404(course_id)
    title = request.form.get('title', '').strip()
    ttype = request.form.get('type', 'video')
    if not title:
        return jsonify({'success': False, 'message': 'Title required'}), 400
    if ttype not in ('video', 'quiz', 'text'):
        return jsonify({'success': False, 'message': 'Invalid type'}), 400

    topic = Topic(course_id=course.id, title=title, type=ttype,
                  order_index=len(course.topics))
    lesson = Lesson(title=title, type=ttype, order_index=0)

    if ttype == 'video':
        file = request.files.get('video_file')
        if not file or file.filename == '':
            return jsonify({'success': False, 'message': 'Video file required'}), 400
        if not allowed_video(file.filename):
            return jsonify({'success': False, 'message': 'Unsupported video format'}), 400
        lesson.video_filename = _save_video(file)
        lesson.description = request.form.get('description', '')
    elif ttype == 'text':
        lesson.content = request.form.get('content', '')

    db.session.add(topic)
    db.session.flush()
    lesson.topic_id = topic.id
    db.session.add(lesson)
    db.session.flush()

    if ttype == 'quiz':
        db.session.add(Quiz(lesson_id=lesson.id, title=title))

    db.session.commit()
    return jsonify({'success': True, 'topic': topic.to_dict()})


@admin_bp.route('/topics/<int:topic_id>/update', methods=['POST'])
def update_topic(topic_id):
    topic = Topic.query.get_or_404(topic_id)
    topic.title = request.form.get('title', topic.title)
    db.session.commit()
    return jsonify({'success': True})


@admin_bp.route('/topics/<int:topic_id>/delete', methods=['POST'])
def delete_topic(topic_id):
    topic = Topic.query.get_or_404(topic_id)
    _remove_video(topic.video_filename)
    for lesson in topic.lessons:
        _remove_video(lesson.video_filename)
    db.session.delete(topic)
    db.session.commit()
    return jsonify({'success': True})


# ---------------------------------------------------------------------------
# Lessons (AJAX)
# ---------------------------------------------------------------------------

@admin_bp.route('/topics/<int:topic_id>/lessons/add', methods=['POST'])
def add_lesson(topic_id):
    topic = Topic.query.get_or_404(topic_id)
    title = request.form.get('title', '').strip() or topic.title
    ltype = request.form.get('type', 'video')
    if ltype not in ('video', 'quiz', 'text'):
        return jsonify({'success': False, 'message': 'Invalid type'}), 400

    lesson = Lesson(topic_id=topic.id, title=title, type=ltype,
                    order_index=len(topic.lessons))

    if ltype == 'video':
        file = request.files.get('video_file')
        if not file or file.filename == '':
            return jsonify({'success': False, 'message': 'Video file required'}), 400
        if not allowed_video(file.filename):
            return jsonify({'success': False, 'message': 'Unsupported video format'}), 400
        lesson.video_filename = _save_video(file)
        lesson.description = request.form.get('description', '')
    elif ltype == 'text':
        lesson.content = request.form.get('content', '')

    db.session.add(lesson)
    db.session.flush()

    if ltype == 'quiz':
        db.session.add(Quiz(lesson_id=lesson.id, title=title))

    db.session.commit()
    return jsonify({'success': True, 'lesson': lesson.to_dict()})


@admin_bp.route('/lessons/<int:lesson_id>/update', methods=['POST'])
def update_lesson(lesson_id):
    lesson = Lesson.query.get_or_404(lesson_id)
    lesson.title = request.form.get('title', lesson.title)
    lesson.description = request.form.get('description', lesson.description)
    lesson.content = request.form.get('content', lesson.content)
    db.session.commit()
    return jsonify({'success': True})


@admin_bp.route('/lessons/<int:lesson_id>/delete', methods=['POST'])
def delete_lesson(lesson_id):
    lesson = Lesson.query.get_or_404(lesson_id)
    _remove_video(lesson.video_filename)
    db.session.delete(lesson)
    db.session.commit()
    return jsonify({'success': True})

# ---------------------------------------------------------------------------
# Questions
# ---------------------------------------------------------------------------

@admin_bp.route('/quizzes/<int:quiz_id>/questions')
def manage_questions(quiz_id):
    quiz = Quiz.query.get_or_404(quiz_id)
    return render_template('question_new.html', quiz=quiz)


@admin_bp.route('/quizzes/<int:quiz_id>/questions/add', methods=['POST'])
def add_question(quiz_id):
    quiz = Quiz.query.get_or_404(quiz_id)
    text = request.form.get('text', '').strip()
    option1 = request.form.get('option1', '').strip()
    option2 = request.form.get('option2', '').strip()
    option3 = request.form.get('option3', '').strip()
    option4 = request.form.get('option4', '').strip()
    correct_option = request.form.get('correct_option')

    if not all([text, option1, option2, option3, option4, correct_option]):
        return jsonify({'success': False, 'message': 'All fields are required'}), 400

    question = Question(
        quiz_id=quiz.id, text=text,
        option1=option1, option2=option2, option3=option3, option4=option4,
        correct_option=int(correct_option),
    )
    db.session.add(question)
    db.session.commit()
    return jsonify({'success': True, 'question': question.to_dict()})


@admin_bp.route('/questions/<int:question_id>/delete', methods=['POST'])
def delete_question(question_id):
    question = Question.query.get_or_404(question_id)
    db.session.delete(question)
    db.session.commit()
    return jsonify({'success': True})


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

@admin_bp.route('/users')
def users():
    all_users = User.query.order_by(User.created_at.desc()).all()
    return render_template('admin/users.html', users=all_users)


@admin_bp.route('/users/<int:user_id>')
def user_detail(user_id):
    user = User.query.get_or_404(user_id)
    submissions = user.submissions[-20:]
    return render_template('admin/user_detail.html', user=user, submissions=submissions)


@admin_bp.route('/users/<int:user_id>/delete', methods=['POST'])
def delete_user(user_id):
    if user_id == current_user.id:
        return jsonify({'success': False, 'message': "You can't delete your own account."}), 400
    user = User.query.get_or_404(user_id)
    db.session.delete(user)
    db.session.commit()
    return jsonify({'success': True})


@admin_bp.route('/users/<int:user_id>/role', methods=['POST'])
def set_user_role(user_id):
    user = User.query.get_or_404(user_id)
    role = request.form.get('role', user.role)
    if role not in ('admin', 'student'):
        return jsonify({'success': False, 'message': 'Invalid role'}), 400
    if user.id == current_user.id and role != 'admin':
        return jsonify({'success': False, 'message': "You can't demote yourself."}), 400
    user.role = role
    db.session.commit()
    return jsonify({'success': True})


# ---------------------------------------------------------------------------
# Hardware profiles
# ---------------------------------------------------------------------------

@admin_bp.route('/hardware')
def hardware():
    profiles = HardwareProfile.query.order_by(HardwareProfile.is_default.desc()).all()
    return render_template('admin/hardware.html', profiles=profiles)


@admin_bp.route('/hardware/create', methods=['POST'])
def create_hardware():
    data = request.get_json(silent=True) or request.form
    profile = HardwareProfile(
        name=data.get('name', ''),
        description=data.get('description', ''),
        default_code=data.get('default_code', ''),
        is_default=bool(data.get('is_default', False))
    )
    if not profile.name:
        return jsonify({'success': False, 'message': 'Name required'}), 400
    if profile.is_default:
        HardwareProfile.query.update({'is_default': False})
    db.session.add(profile)
    db.session.commit()
    return jsonify({'success': True, 'hardware': profile.to_dict()})


@admin_bp.route('/hardware/<int:profile_id>/update', methods=['POST'])
def update_hardware(profile_id):
    profile = HardwareProfile.query.get_or_404(profile_id)
    data = request.get_json(silent=True) or request.form
    profile.name = data.get('name', profile.name)
    profile.description = data.get('description', profile.description)
    profile.default_code = data.get('default_code', profile.default_code)
    if data.get('is_default'):
        HardwareProfile.query.update({'is_default': False})
        profile.is_default = True
    db.session.commit()
    return jsonify({'success': True})


@admin_bp.route('/hardware/<int:profile_id>/delete', methods=['POST'])
def delete_hardware(profile_id):
    profile = HardwareProfile.query.get_or_404(profile_id)
    db.session.delete(profile)
    db.session.commit()
    return jsonify({'success': True})
