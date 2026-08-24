from datetime import datetime, date
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

from app.extensions import db


class User(UserMixin, db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=True)
    role = db.Column(db.String(20), nullable=False, default='student')
    name = db.Column(db.String(100), nullable=True)
    avatar = db.Column(db.String(500), nullable=True)
    auth_provider = db.Column(db.String(20), default='local')
    google_id = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    submissions = db.relationship('Submission', backref='user', lazy=True)
    enrollments = db.relationship('Enrollment', backref='user', lazy=True, cascade='all, delete-orphan')
    progress = db.relationship('TopicProgress', backref='user', lazy=True, cascade='all, delete-orphan')
    activity = db.relationship('ActivityLog', backref='user', lazy=True, cascade='all, delete-orphan')

    @property
    def is_admin(self):
        return self.role == 'admin'

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        if self.password_hash is None:
            return False
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'name': self.name or self.username,
            'email': self.email,
            'avatar': self.avatar,
            'role': self.role,
            'auth_provider': self.auth_provider,
            'created_at': str(self.created_at)
        }


class Course(db.Model):
    __tablename__ = 'courses'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text, default='')
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    topics = db.relationship(
        'Topic', backref='course', lazy=True,
        order_by='Topic.order_index', cascade='all, delete-orphan'
    )
    enrollments = db.relationship('Enrollment', backref='course', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id, 'title': self.title, 'description': self.description,
            'created_at': str(self.created_at),
            'topics': [t.to_dict() for t in self.topics]
        }


class Topic(db.Model):
    __tablename__ = 'topics'

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False)
    title = db.Column(db.String(150), nullable=False)
    type = db.Column(db.String(20), nullable=False, default='video')
    video_filename = db.Column(db.String(300))
    content = db.Column(db.Text)
    order_index = db.Column(db.Integer, default=0)

    lessons = db.relationship(
        'Lesson', backref='topic', lazy=True,
        order_by='Lesson.order_index', cascade='all, delete-orphan'
    )
    progress_entries = db.relationship(
        'TopicProgress', backref='topic', lazy=True, cascade='all, delete-orphan'
    )

    @property
    def icon_type(self):
        if self.lessons:
            return self.lessons[0].type
        return self.type or 'video'

    def to_dict(self):
        return {
            'id': self.id, 'title': self.title, 'type': self.type,
            'video_filename': self.video_filename, 'content': self.content,
            'order_index': self.order_index,
            'lessons': [l.to_dict() for l in self.lessons]
        }


class Lesson(db.Model):
    __tablename__ = 'lessons'

    id = db.Column(db.Integer, primary_key=True)
    topic_id = db.Column(db.Integer, db.ForeignKey('topics.id'), nullable=False)
    title = db.Column(db.String(150), default='')
    type = db.Column(db.String(20), nullable=False, default='video')
    video_filename = db.Column(db.String(300))
    description = db.Column(db.Text, default='')
    content = db.Column(db.Text)
    order_index = db.Column(db.Integer, default=0)

    quiz = db.relationship(
        'Quiz', backref='lesson', uselist=False, cascade='all, delete-orphan'
    )

    @property
    def display_title(self):
        return self.title or (self.topic.title if self.topic else '')

    def to_dict(self):
        return {
            'id': self.id, 'title': self.title, 'type': self.type,
            'video_filename': self.video_filename, 'description': self.description,
            'content': self.content, 'order_index': self.order_index,
            'has_quiz': self.quiz is not None
        }


class Quiz(db.Model):
    __tablename__ = 'quizzes'

    id = db.Column(db.Integer, primary_key=True)
    lesson_id = db.Column(db.Integer, db.ForeignKey('lessons.id'), nullable=False)
    title = db.Column(db.String(150), nullable=False)

    questions = db.relationship(
        'Question', backref='quiz', lazy=True, cascade='all, delete-orphan'
    )
    submissions = db.relationship('Submission', backref='quiz', lazy=True, cascade='all, delete-orphan')


class Question(db.Model):
    __tablename__ = 'questions'

    id = db.Column(db.Integer, primary_key=True)
    quiz_id = db.Column(db.Integer, db.ForeignKey('quizzes.id'), nullable=False)
    text = db.Column(db.Text, nullable=False)
    option1 = db.Column(db.String(300), nullable=False)
    option2 = db.Column(db.String(300), nullable=False)
    option3 = db.Column(db.String(300), nullable=False)
    option4 = db.Column(db.String(300), nullable=False)
    correct_option = db.Column(db.Integer, nullable=False)

    def to_dict(self):
        return {
            'id': self.id, 'text': self.text,
            'options': [self.option1, self.option2, self.option3, self.option4],
            'correct_option': self.correct_option
        }


class Submission(db.Model):
    __tablename__ = 'submissions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    quiz_id = db.Column(db.Integer, db.ForeignKey('quizzes.id'), nullable=False)
    score = db.Column(db.Integer, default=0)
    total = db.Column(db.Integer, default=0)
    submitted_at = db.Column(db.DateTime, default=datetime.utcnow)


class Enrollment(db.Model):
    __tablename__ = 'enrollments'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False)
    enrolled_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (db.UniqueConstraint('user_id', 'course_id', name='uq_user_course'),)


class TopicProgress(db.Model):
    __tablename__ = 'topic_progress'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    topic_id = db.Column(db.Integer, db.ForeignKey('topics.id'), nullable=False)
    completed = db.Column(db.Boolean, default=True)
    completed_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (db.UniqueConstraint('user_id', 'topic_id', name='uq_user_topic'),)


class ActivityLog(db.Model):
    __tablename__ = 'activity_log'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    day = db.Column(db.Date, default=date.today)

    __table_args__ = (db.UniqueConstraint('user_id', 'day', name='uq_user_day'),)


class HardwareProfile(db.Model):
    __tablename__ = 'hardware_profiles'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    svg_config = db.Column(db.JSON, nullable=True)
    default_code = db.Column(db.Text, nullable=True)
    is_default = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'description': self.description,
            'svg_config': self.svg_config, 'default_code': self.default_code,
            'is_default': self.is_default
        }