import os
from datetime import date, timedelta

from flask import Blueprint, render_template, abort, request, redirect, url_for, flash, current_app
from flask_login import current_user, login_required
from app.extensions import db
from app.models import Course, Topic, Lesson, Quiz, Submission, Enrollment, TopicProgress, ActivityLog, HardwareProfile
from app.utils import admin_required, allowed_video

main_bp = Blueprint('main', __name__)


def login_guard():
    if not current_user.is_authenticated:
        return True
    return False


@main_bp.route('/')
def index():
    if login_guard():
        return redirect(url_for('auth.login'))
    courses = Course.query.order_by(Course.created_at.desc()).all()
    enrolled_ids = {e.course_id for e in current_user.enrollments}
    for c in courses:
        c.is_enrolled = c.id in enrolled_ids
        total = len(c.topics)
        done = TopicProgress.query.join(Topic).filter(
            Topic.course_id == c.id, TopicProgress.user_id == current_user.id
        ).count()
        c.progress_pct = int(done / total * 100) if total else 0
    return render_template('main.html', courses=courses)


@main_bp.route('/course/new', methods=['POST'])
@login_required
@admin_required
def course_new():
    title = request.form.get('title', '').strip()
    description = request.form.get('description', '').strip()
    if not title:
        flash('Course title is required.', 'danger')
        return redirect(url_for('main.index'))
    course = Course(title=title, description=description, created_by=current_user.id)
    db.session.add(course)
    db.session.commit()
    flash('Course created.', 'success')
    return redirect(url_for('main.course_view', course_id=course.id))


@main_bp.route('/course/<int:course_id>/delete', methods=['POST'])
@login_required
@admin_required
def course_delete(course_id):
    course = Course.query.get_or_404(course_id)
    db.session.delete(course)
    db.session.commit()
    flash('Course deleted.', 'success')
    return redirect(url_for('main.index'))


@main_bp.route('/course/<int:course_id>/enroll', methods=['POST'])
@login_required
def course_enroll(course_id):
    course = Course.query.get_or_404(course_id)
    existing = Enrollment.query.filter_by(user_id=current_user.id, course_id=course.id).first()
    if not existing:
        db.session.add(Enrollment(user_id=current_user.id, course_id=course.id))
        db.session.commit()
        flash(f'Enrolled in {course.title}!', 'success')
    return redirect(url_for('main.course_view', course_id=course.id))


@main_bp.route('/course/<int:course_id>')
@login_required
def course_view(course_id):
    course = Course.query.get_or_404(course_id)
    done_ids = {
        p.topic_id for p in TopicProgress.query.filter_by(user_id=current_user.id)
        if p.topic.course_id == course_id
    }
    for t in course.topics:
        t.is_done = t.id in done_ids
    return render_template('course_view.html', course=course)


@main_bp.route('/course/<int:course_id>/topic/new', methods=['POST'])
@login_required
@admin_required
def topic_new(course_id):
    course = Course.query.get_or_404(course_id)
    title = request.form.get('title', '').strip()
    ttype = request.form.get('type', 'video')

    if not title or ttype not in ('video', 'quiz', 'text'):
        flash('Invalid topic data.', 'danger')
        return redirect(url_for('main.course_view', course_id=course.id))

    topic = Topic(
        course_id=course.id,
        title=title,
        type=ttype,
        order_index=len(course.topics),
    )
    lesson = Lesson(title=title, type=ttype, order_index=0)

    if ttype == 'video':
        file = request.files.get('video_file')
        if not file or file.filename == '':
            flash('Please choose a video file to upload.', 'danger')
            return redirect(url_for('main.course_view', course_id=course.id))
        if not allowed_video(file.filename):
            flash('Unsupported video format. Use mp4, webm, ogg, mov or mkv.', 'danger')
            return redirect(url_for('main.course_view', course_id=course.id))
        import uuid
        from werkzeug.utils import secure_filename
        stored_name = f"{uuid.uuid4().hex}_{secure_filename(file.filename)}"
        upload_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'videos')
        os.makedirs(upload_dir, exist_ok=True)
        file.save(os.path.join(upload_dir, stored_name))
        lesson.video_filename = stored_name
        lesson.description = request.form.get('description', '').strip()

    elif ttype == 'text':
        lesson.content = request.form.get('content', '').strip()

    db.session.add(topic)
    db.session.flush()
    lesson.topic_id = topic.id
    db.session.add(lesson)
    db.session.flush()

    if ttype == 'quiz':
        db.session.add(Quiz(lesson_id=lesson.id, title=title))

    db.session.commit()
    flash('Stop added to the path.', 'success')
    return redirect(url_for('main.course_view', course_id=course.id))


@main_bp.route('/topic/<int:topic_id>/lesson/new', methods=['POST'])
@login_required
@admin_required
def lesson_new(topic_id):
    topic = Topic.query.get_or_404(topic_id)
    title = request.form.get('title', '').strip() or topic.title
    ltype = request.form.get('type', 'video')

    if ltype not in ('video', 'quiz', 'text'):
        flash('Invalid lesson data.', 'danger')
        return redirect(url_for('main.topic_view', topic_id=topic.id))

    lesson = Lesson(
        topic_id=topic.id,
        title=title,
        type=ltype,
        order_index=len(topic.lessons),
    )

    if ltype == 'video':
        file = request.files.get('video_file')
        if not file or file.filename == '':
            flash('Please choose a video file to upload.', 'danger')
            return redirect(url_for('main.topic_view', topic_id=topic.id))
        if not allowed_video(file.filename):
            flash('Unsupported video format. Use mp4, webm, ogg, mov or mkv.', 'danger')
            return redirect(url_for('main.topic_view', topic_id=topic.id))
        import uuid
        from werkzeug.utils import secure_filename
        stored_name = f"{uuid.uuid4().hex}_{secure_filename(file.filename)}"
        upload_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'videos')
        os.makedirs(upload_dir, exist_ok=True)
        file.save(os.path.join(upload_dir, stored_name))
        lesson.video_filename = stored_name
        lesson.description = request.form.get('description', '').strip()

    elif ltype == 'text':
        lesson.content = request.form.get('content', '').strip()

    db.session.add(lesson)
    db.session.flush()

    if ltype == 'quiz':
        db.session.add(Quiz(lesson_id=lesson.id, title=title))

    db.session.commit()
    flash('Lesson added to this stop.', 'success')
    return redirect(url_for('main.topic_view', topic_id=topic.id))


@main_bp.route('/lesson/<int:lesson_id>/delete', methods=['POST'])
@login_required
@admin_required
def lesson_delete(lesson_id):
    lesson = Lesson.query.get_or_404(lesson_id)
    topic_id = lesson.topic_id
    if lesson.video_filename:
        path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'videos', lesson.video_filename)
        if os.path.exists(path):
            os.remove(path)
    db.session.delete(lesson)
    db.session.commit()
    flash('Lesson removed from the stop.', 'success')
    return redirect(url_for('main.topic_view', topic_id=topic_id))


@main_bp.route('/topic/<int:topic_id>/delete', methods=['POST'])
@login_required
@admin_required
def topic_delete(topic_id):
    topic = Topic.query.get_or_404(topic_id)
    course_id = topic.course_id
    filenames = [l.video_filename for l in topic.lessons if l.video_filename]
    if topic.video_filename:
        filenames.append(topic.video_filename)
    for name in filenames:
        path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'videos', name)
        if os.path.exists(path):
            os.remove(path)
    db.session.delete(topic)
    db.session.commit()
    return redirect(url_for('main.course_view', course_id=course_id))


def _next_topic(topic):
    return Topic.query.filter(
        Topic.course_id == topic.course_id,
        Topic.order_index > topic.order_index
    ).order_by(Topic.order_index.asc()).first()


@main_bp.route('/topic/<int:topic_id>')
@login_required
def topic_view(topic_id):
    topic = Topic.query.get_or_404(topic_id)
    nxt = _next_topic(topic)
    prev = Topic.query.filter(
        Topic.course_id == topic.course_id,
        Topic.order_index < topic.order_index
    ).order_by(Topic.order_index.desc()).first()
    return render_template('topic_view.html', topic=topic,
                           next_topic=nxt, prev_topic=prev)


@main_bp.route('/topic/<int:topic_id>/complete', methods=['POST'])
@login_required
def topic_complete(topic_id):
    topic = Topic.query.get_or_404(topic_id)
    existing = TopicProgress.query.filter_by(user_id=current_user.id, topic_id=topic.id).first()
    if not existing:
        db.session.add(TopicProgress(user_id=current_user.id, topic_id=topic.id))
        db.session.commit()

    nxt = _next_topic(topic)
    if nxt:
        return redirect(url_for('main.topic_view', topic_id=nxt.id))
    flash('Lesson complete! You finished this path. 🎉', 'success')
    return redirect(url_for('main.course_view', course_id=topic.course_id))


@main_bp.route('/quiz/<int:quiz_id>/submit', methods=['POST'])
@login_required
def quiz_submit(quiz_id):
    quiz = Quiz.query.get_or_404(quiz_id)
    score = 0
    for q in quiz.questions:
        chosen = request.form.get(f'question_{q.id}')
        if chosen and int(chosen) == q.correct_option:
            score += 1

    submission = Submission(
        user_id=current_user.id, quiz_id=quiz.id, score=score, total=len(quiz.questions)
    )
    db.session.add(submission)
    db.session.commit()

    nxt = _next_topic(quiz.lesson.topic)
    return render_template('quiz_result.html', quiz=quiz, submission=submission, next_topic=nxt)


@main_bp.route('/profile')
@login_required
def profile():
    enrollments = Enrollment.query.filter_by(user_id=current_user.id).all()
    course_progress = []
    for e in enrollments:
        c = e.course
        total = len(c.topics)
        done = TopicProgress.query.join(Topic).filter(
            Topic.course_id == c.id, TopicProgress.user_id == current_user.id
        ).count()
        pct = int(done / total * 100) if total else 0
        course_progress.append({'course': c, 'done': done, 'total': total, 'pct': pct})

    days_back = 18 * 7 - 1
    start = date.today() - timedelta(days=days_back)
    active_days = {
        a.day for a in ActivityLog.query.filter(
            ActivityLog.user_id == current_user.id, ActivityLog.day >= start
        )
    }
    start -= timedelta(days=(start.weekday() + 1) % 7)
    weeks = []
    cur = start
    while cur <= date.today():
        week = []
        for _ in range(7):
            week.append({'date': cur, 'active': cur in active_days, 'future': cur > date.today()})
            cur += timedelta(days=1)
        weeks.append(week)

    total_active = len(active_days)

    streak = 0
    cursor = date.today()
    while cursor in active_days:
        streak += 1
        cursor -= timedelta(days=1)

    return render_template(
        'profile.html',
        course_progress=course_progress,
        weeks=weeks,
        total_active=total_active,
        streak=streak,
    )


@main_bp.route('/editor')
@login_required
def editor():
    profiles = HardwareProfile.query.order_by(HardwareProfile.is_default.desc()).all()
    return render_template('editor.html', hardware_profiles=profiles)