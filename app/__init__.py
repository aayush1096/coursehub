import os
from flask import Flask, send_from_directory
from app.config import Config
from app.extensions import db, login_manager


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    login_manager.init_app(app)

    @app.route('/uploads/<path:filename>')
    def uploaded_file(filename):
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

    @app.template_filter('upload_exists')
    def upload_exists(relative_path):
        upload_dir = os.path.join(app.config['UPLOAD_FOLDER'], os.path.dirname(relative_path))
        name = os.path.basename(relative_path)
        return os.path.exists(os.path.join(upload_dir, name))

    from app.models import User

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    @app.before_request
    def track_activity():
        from datetime import date
        from flask_login import current_user
        from app.models import ActivityLog
        if current_user.is_authenticated:
            today = date.today()
            exists = ActivityLog.query.filter_by(user_id=current_user.id, day=today).first()
            if not exists:
                db.session.add(ActivityLog(user_id=current_user.id, day=today))
                db.session.commit()

    from app.auth import auth_bp
    from app.routes import main_bp
    from app.admin_routes import admin_bp
    from app.api_routes import api_bp

    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(main_bp)
    app.register_blueprint(admin_bp, url_prefix='/admin')
    app.register_blueprint(api_bp, url_prefix='/api')

    @app.errorhandler(403)
    def forbidden(e):
        from flask import render_template
        return render_template('error.html', code=403,
                               message="You don't have permission to view this page."), 403

    @app.errorhandler(404)
    def not_found(e):
        from flask import render_template
        return render_template('error.html', code=404, message='Page not found.'), 404

    with app.app_context():
        from app import models
        db.create_all()
        _create_default_admin()
        _seed_hardware_profiles()

    return app


def _create_default_admin():
    from app.models import User
    from app.config import Config
    from werkzeug.security import generate_password_hash

    if not User.query.filter_by(role='admin').first():
        admin = User(
            username='admin',
            email=Config.ADMIN_EMAIL,
            password_hash=generate_password_hash(Config.ADMIN_PASSWORD),
            role='admin',
            name='Administrator',
            auth_provider='local'
        )
        db.session.add(admin)
        db.session.commit()
        print('Created default admin -> username: admin / password: admin123')


def _seed_hardware_profiles():
    from app.models import HardwareProfile

    if HardwareProfile.query.count() == 0:
        uno = HardwareProfile(
            name='Arduino Uno',
            description='ATmega328P microcontroller with 14 digital I/O pins and 6 analog inputs',
            is_default=True,
            svg_config={
                'pins': {
                    'digital': ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13'],
                    'analog': ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'],
                    'power': ['5V', '3.3V', 'VIN', 'GND']
                },
                'display': 'ATmega328P'
            },
            default_code='''void setup() {
  pinMode(13, OUTPUT);
  pinMode(2, INPUT_PULLUP);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(1000);
  digitalWrite(13, LOW);
  delay(1000);
}'''
        )
        db.session.add(uno)
        db.session.commit()